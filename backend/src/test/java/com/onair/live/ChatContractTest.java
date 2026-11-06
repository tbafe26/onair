package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.broadcast.StartLiveCommand;
import com.onair.comment.Comment;
import com.onair.comment.Comments;
import com.onair.support.ApiTestSupport;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 채팅 WebSocket 메시지가 공유 계약 파일(contracts/chat.json)과 같은지 확인한다. 서버가 실제로 보낸 메시지를 대조한다. */
public class ChatContractTest extends ApiTestSupport {

    public static final Path CONTRACT = Path.of("..", "contracts", "chat.json");

    final JsonMapper json = JsonMapper.builder().build();
    final JsonNode contract = json.readTree(CONTRACT.toFile());

    @Autowired
    Comments comments;

    @Autowired
    LiveChat chat;

    @Autowired
    LiveBroadcasting live;

    List<String> 이름들(JsonNode array) {
        List<String> names = new ArrayList<>();
        array.forEach(n -> names.add(n.asString()));
        return names;
    }

    @Test
    void 서버가_보내는_채팅_메시지의_종류와_필드는_계약과_같다() {
        long id = live.start(new StartLiveCommand("계약", null), owner().userId()).broadcastId();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        comments.write(id, owner().userId(), "계약 확인");
        live.endByOwner(id, owner().userId());

        JsonNode messages = contract.get("messages");
        // donation은 결제 승인이 있어야 나가므로 DonationChatApiTest가 대조한다.
        assertThat(subscriber.types()).containsExactlyInAnyOrderElementsOf(
                messages.propertyNames().stream().filter(name -> !name.equals(ChatMessage.DONATION)).toList());
        for (ChatMessage message : subscriber.received) {
            assertThat(message.fields().keySet()).as(message.type() + "의 필드")
                    .containsExactlyInAnyOrderElementsOf(이름들(messages.get(message.type()).get("server->client")));
        }
        assertThat(ChatMessage.COMMENT).isEqualTo("comment");
        assertThat(ChatMessage.DONATION).isEqualTo("donation");
        assertThat(subscriber.received.getLast().type()).isEqualTo(ChatMessage.ENDED);
    }

    @Test
    void 댓글_길이_상한은_계약과_같다() {
        assertThat(Comment.MAX_LENGTH).isEqualTo(contract.get("commentMaxLength").asInt());
    }

    @Test
    void 채팅_메시지에_실린_댓글의_JSON_필드는_계약과_같다() {
        long id = live.start(new StartLiveCommand("계약", null), owner().userId()).broadcastId();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        chat.subscribe(id, subscriber);
        comments.write(id, owner().userId(), "계약 확인");

        // 화면이 받는 모양 그대로(WebSocketPeer와 같은 직렬화)로 바꿔 필드 이름을 본다.
        JsonNode comment = json.readTree(json.writeValueAsString(subscriber.last().fields().get("comment")));

        assertThat(comment.propertyNames()).containsExactlyInAnyOrderElementsOf(이름들(contract.get("commentFields")));
        assertThat(comment.get("author").propertyNames())
                .containsExactlyInAnyOrderElementsOf(이름들(contract.get("authorFields")));
    }
}
