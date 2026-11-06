package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.AuthClient;
import com.onair.broadcast.StartLiveCommand;
import com.onair.live.ChatContractTest;
import com.onair.live.ChatMessage;
import com.onair.live.LiveBroadcasting;
import com.onair.live.LiveChat;
import com.onair.live.RecordingSubscriber;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import tools.jackson.databind.JsonNode;

/** 후원이 확정되면 그 방송의 채팅 구독자에게 donation 메시지가 한 번만 나가는지 확인한다. */
class DonationChatApiTest extends DonationApiTestSupport {

    @Autowired
    LiveChat chat;

    @Autowired
    LiveBroadcasting live;

    List<ChatMessage> 후원_메시지(RecordingSubscriber subscriber) {
        return subscriber.received.stream().filter(m -> m.type().equals("donation")).toList();
    }

    @Test
    void 확정되면_구독자가_후원_메시지와_새_합계를_받는다() throws Exception {
        int id = 라이브방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        AuthClient viewer = 시청자();
        String first = 주문을_만든다(viewer.credentials(), id, 5000, "힘내세요");
        String second = 주문을_만든다(viewer.credentials(), id, 3000, "또 왔어요");

        승인한다(viewer.credentials(), "pk_1", first, 5000).andExpect(status().isOk());
        승인한다(viewer.credentials(), "pk_2", second, 3000).andExpect(status().isOk());

        List<ChatMessage> messages = 후원_메시지(subscriber);
        assertThat(messages).hasSize(2);
        String wire = JSON.writeValueAsString(messages.getLast().fields());
        JsonNode last = JSON.readTree(wire).get("donation");
        assertThat(last.get("amount").asLong()).isEqualTo(3000);
        assertThat(last.get("message").asString()).isEqualTo("또 왔어요");
        assertThat(last.get("donor").get("id").asLong()).isEqualTo(viewer.userId());
        assertThat(last.get("donor").get("nickname").asString()).isEqualTo("시청자닉");
        assertThat(last.get("confirmedAt").asString()).isNotEmpty();
        assertThat(last.get("total").get("amount").asLong()).isEqualTo(8000);
        assertThat(last.get("total").get("count").asLong()).isEqualTo(2);
        assertThat(wire).doesNotContain("pk_2", second);
    }

    @Test
    void 후원_메시지의_종류와_필드는_계약과_같다() throws Exception {
        JsonNode contract = JSON.readTree(ChatContractTest.CONTRACT.toFile());
        int id = 라이브방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        AuthClient viewer = 시청자();
        승인한다(viewer.credentials(), "pk_1", 주문을_만든다(viewer.credentials(), id, 5000, "계약"), 5000)
                .andExpect(status().isOk());

        ChatMessage message = 후원_메시지(subscriber).getFirst();
        JsonNode donation = JSON.readTree(JSON.writeValueAsString(message.fields())).get("donation");

        assertThat(message.type()).isEqualTo("donation");
        assertThat(message.fields().keySet())
                .containsExactlyInAnyOrderElementsOf(이름들(contract.get("messages").get("donation").get("server->client")));
        assertThat(donation.propertyNames()).containsExactlyInAnyOrderElementsOf(이름들(contract.get("donationFields")));
        assertThat(donation.get("donor").propertyNames()).containsExactlyInAnyOrderElementsOf(이름들(contract.get("donorFields")));
        assertThat(donation.get("total").propertyNames()).containsExactlyInAnyOrderElementsOf(이름들(contract.get("totalFields")));
    }

    static List<String> 이름들(JsonNode array) {
        List<String> names = new ArrayList<>();
        array.forEach(n -> names.add(n.asString()));
        return names;
    }

    @Test
    void 같은_승인을_반복해도_한_번만_보낸다() throws Exception {
        int id = 라이브방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_메시지(subscriber)).hasSize(1);
    }

    @Test
    void 승인_통지로_확정돼도_한_번만_보내고_승인이_겹쳐도_늘지_않는다() throws Exception {
        int id = 라이브방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");
        payments.onFind(key -> new PaymentResult.Paid("DONE", orderId, 5000, key));

        for (int i = 0; i < 2; i++) {
            mockMvc.perform(post("/api/payments/toss/notifications").contentType(MediaType.APPLICATION_JSON)
                    .content("{\"eventType\":\"PAYMENT_STATUS_CHANGED\",\"data\":{\"paymentKey\":\"pk_1\","
                            + "\"orderId\":\"" + orderId + "\",\"status\":\"DONE\"}}"))
                    .andExpect(status().isOk());
        }
        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_메시지(subscriber)).hasSize(1);
    }

    @Test
    void 방송이_끝난_뒤_확정된_후원은_보내지_않는다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "마지막");
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        live.endByOwner(id, owner().userId());

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_메시지(subscriber)).isEmpty();
        assertThat(후원_행(orderId)).containsEntry("STATUS", "CONFIRMED");
    }

    @Test
    void 다른_방송의_구독자는_받지_않는다() throws Exception {
        int id = 라이브방송을_시작한다();
        AuthClient other = AuthClient.signedUp(mockMvc, "other01", "다른닉");
        long otherId = live.start(new StartLiveCommand("다른 방송", null), other.userId()).broadcastId();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(otherId, subscriber);
        AuthClient viewer = 시청자();
        String orderId = 주문을_만든다(viewer.credentials(), id, 5000, "응원");

        승인한다(viewer.credentials(), "pk_1", orderId, 5000).andExpect(status().isOk());

        assertThat(후원_메시지(subscriber)).isEmpty();
    }
}
