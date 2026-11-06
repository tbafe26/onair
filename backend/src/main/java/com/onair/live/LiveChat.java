package com.onair.live;

import com.onair.broadcast.Broadcast;
import com.onair.broadcast.BroadcastRepository;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import org.springframework.stereotype.Component;

/**
 * 방의 채팅 구독자 표. 방송 중인 라이브방송 하나에 구독자 묶음 하나이고, 서버 메모리에만 둔다(서버 한 대 전제).
 * 방이 닫힐 때({@link #close}) 구독자 전원에게 ended를 보내고 함께 닫는다.
 *
 * <p>LiveBroadcasting의 전역 잠금을 쓰지 않는다. 구독과 전송이 다른 방송의 종료나 채팅을 막지 않도록 방송마다 따로 움직인다.
 */
@Component
public class LiveChat {

    private final BroadcastRepository broadcasts;
    private final Map<Long, Set<ChatSubscriber>> subscribers = new ConcurrentHashMap<>();

    LiveChat(BroadcastRepository broadcasts) {
        this.broadcasts = broadcasts;
    }

    /** 채팅 구독을 시작한다. 방송 중인 라이브방송만 구독자로 받고, 종료된 방송은 바로 ended를 보내고 닫는다. */
    public void subscribe(long broadcastId, ChatSubscriber subscriber) {
        // 먼저 등록하고 나중에 상태를 읽는다. 읽는 사이에 방송이 끝나도 close나 아래 확인 중 한쪽이 ended를 보낸다.
        // 전역 잠금이 없으므로 DB 읽기와 전송이 다른 방송의 채팅을 막지 않는다.
        subscribers.compute(broadcastId, (id, peers) -> {
            Set<ChatSubscriber> set = peers == null ? new CopyOnWriteArraySet<>() : peers;
            set.add(subscriber);
            return set;
        });
        Broadcast broadcast = broadcasts.findById(broadcastId).orElse(null);
        if (broadcast == null || !broadcast.isChat()) {
            release(broadcastId, subscriber);
            subscriber.close();
        } else if (!broadcast.acceptsCommentsNow() && release(broadcastId, subscriber)) {
            subscriber.send(ChatMessage.ended());
            subscriber.close();
        }
    }

    public void unsubscribe(ChatSubscriber subscriber) {
        subscribers.keySet().forEach(broadcastId -> release(broadcastId, subscriber));
    }

    /** 구독자를 표에서 뺀다. 이 호출이 뺐을 때만 true라서, 종료 알림을 보낼 책임이 한 곳에만 생긴다. */
    private boolean release(long broadcastId, ChatSubscriber subscriber) {
        boolean[] released = {false};
        subscribers.computeIfPresent(broadcastId, (id, peers) -> {
            released[0] = peers.remove(subscriber);
            return peers.isEmpty() ? null : peers;
        });
        return released[0];
    }

    /** 방의 구독자 전원에게 채팅을 보낸다. comment는 화면으로 나가는 댓글 모양 그대로다. */
    public void publish(long broadcastId, Object comment) {
        broadcast(broadcastId, ChatMessage.comment(comment));
    }

    /** 방의 구독자 전원에게 확정된 후원을 보낸다. donation은 화면으로 나가는 후원 모양 그대로다. */
    public void publishDonation(long broadcastId, Object donation) {
        broadcast(broadcastId, ChatMessage.donation(donation));
    }

    private void broadcast(long broadcastId, ChatMessage message) {
        // 연결마다 전송이 직렬화되어 있으므로(WebSocketPeer) 여기서는 잠그지 않는다.
        for (ChatSubscriber subscriber : subscribers.getOrDefault(broadcastId, Set.of())) {
            subscriber.send(message);
        }
    }

    /** 방이 닫혔다. 구독자 전원에게 ended를 보내고 닫는다. */
    void close(long broadcastId) {
        Set<ChatSubscriber> peers = subscribers.remove(broadcastId);
        if (peers == null) {
            return;
        }
        for (ChatSubscriber subscriber : peers) {
            subscriber.send(ChatMessage.ended());
            subscriber.close();
        }
    }
}
