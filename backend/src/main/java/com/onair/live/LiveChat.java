package com.onair.live;

import com.onair.broadcast.Broadcast;
import com.onair.broadcast.BroadcastRepository;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * 방의 채팅 구독자 표. 방송 중인 라이브방송 하나에 구독자 묶음 하나이고, 이 서버에 붙은 구독자만 서버 메모리에 둔다.
 * 방이 닫힐 때({@link #close}) 구독자 전원에게 ended를 보내고 함께 닫는다.
 * 메시지는 {@link ChatRelay}로 보내고, 통로에서 받은 메시지를 이 서버 구독자에게 전한다. 보낸 서버도 같은 길로 받는다.
 *
 * <p>LiveBroadcasting의 전역 잠금을 쓰지 않는다. 구독과 전송이 다른 방송의 종료나 채팅을 막지 않도록 방송마다 따로 움직인다.
 */
@Component
public class LiveChat {

    private static final Logger log = LoggerFactory.getLogger(LiveChat.class);

    private final BroadcastRepository broadcasts;
    private final ChatRelay relay;
    private final Map<Long, Set<ChatSubscriber>> subscribers = new ConcurrentHashMap<>();

    LiveChat(BroadcastRepository broadcasts, ChatRelay relay) {
        this.broadcasts = broadcasts;
        this.relay = relay;
        relay.onReceive(new ChatRelay.Receiver() {
            @Override
            public void receive(long broadcastId, ChatMessage message) {
                if (ChatMessage.ENDED.equals(message.type())) {
                    closeHere(broadcastId);
                } else {
                    sendHere(broadcastId, message);
                }
            }

            @Override
            public void missedMessages() {
                dropAllHere();
            }
        });
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
        relay(broadcastId, ChatMessage.comment(comment));
    }

    /** 방의 구독자 전원에게 확정된 후원을 보낸다. donation은 화면으로 나가는 후원 모양 그대로다. */
    public void publishDonation(long broadcastId, Object donation) {
        relay(broadcastId, ChatMessage.donation(donation));
    }

    private void sendHere(long broadcastId, ChatMessage message) {
        // 연결마다 전송이 직렬화되어 있으므로(WebSocketPeer) 여기서는 잠그지 않는다.
        for (ChatSubscriber subscriber : subscribers.getOrDefault(broadcastId, Set.of())) {
            quietly(() -> subscriber.send(message));
        }
    }

    // 한 구독자의 전송 실패가 다른 구독자나 받는 스레드로 번지지 않게 한다. 그 구독자는 다시 접속하면 REST로 읽는다.
    private static void quietly(Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.warn("채팅 구독자에게 보내지 못했다: {}", e.getClass().getSimpleName());
        }
    }

    /** 방이 닫혔다. 모든 서버의 구독자에게 ended를 보내고 닫는다. 종료를 저장하는 트랜잭션 안에서 부른다. */
    void close(long broadcastId) {
        relay(broadcastId, ChatMessage.ended());
    }

    private void closeHere(long broadcastId) {
        Set<ChatSubscriber> peers = subscribers.remove(broadcastId);
        if (peers == null) {
            return;
        }
        for (ChatSubscriber subscriber : peers) {
            quietly(() -> subscriber.send(ChatMessage.ended()));
            quietly(subscriber::close);
        }
    }

    /** 빠진 메시지가 있을 수 있어 이 서버의 구독자를 모두 닫는다. 화면은 다시 접속하며 빠진 채팅을 REST로 읽는다. */
    private void dropAllHere() {
        for (Long broadcastId : subscribers.keySet()) {
            Set<ChatSubscriber> peers = subscribers.remove(broadcastId);
            if (peers != null) {
                peers.forEach(subscriber -> quietly(subscriber::close));
            }
        }
    }

    private void relay(long broadcastId, ChatMessage message) {
        try {
            relay.send(broadcastId, message);
        } catch (RuntimeException e) {
            // 메시지 때문에 저장을 되돌리지 않는다. 구독자는 다시 접속하면 REST로 읽는다.
            log.warn("방송 {}의 {} 메시지를 전하지 못했다: {}", broadcastId, message.type(), e.getClass().getSimpleName());
        }
    }
}
