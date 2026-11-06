package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.Test;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import tools.jackson.databind.json.JsonMapper;

/** 한 연결에 여러 스레드가 동시에 보내도 세션에는 한 번에 하나씩만 쓰는지 확인한다. */
class WebSocketPeerTest {

    @Test
    void 여러_스레드가_동시에_보내도_세션에는_한_번에_하나씩만_쓴다() throws Exception {
        AtomicInteger inFlight = new AtomicInteger();
        AtomicInteger maxInFlight = new AtomicInteger();
        AtomicInteger sent = new AtomicInteger();
        WebSocketSession session = mock(WebSocketSession.class);
        when(session.isOpen()).thenReturn(true);
        doAnswer(invocation -> {
            maxInFlight.accumulateAndGet(inFlight.incrementAndGet(), Math::max);
            Thread.sleep(1);
            inFlight.decrementAndGet();
            sent.incrementAndGet();
            return null;
        }).when(session).sendMessage(any(TextMessage.class));
        Peer peer = new WebSocketPeer(session, JsonMapper.builder().build());

        int threads = 8;
        int perThread = 10;
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        CountDownLatch start = new CountDownLatch(1);
        for (int i = 0; i < threads; i++) {
            pool.submit(() -> {
                start.await();
                for (int j = 0; j < perThread; j++) {
                    peer.send(SignalMessage.of("viewer-count", "count", j));
                }
                return null;
            });
        }
        start.countDown();
        pool.shutdown();
        assertThat(pool.awaitTermination(30, TimeUnit.SECONDS)).isTrue();

        assertThat(sent.get()).isEqualTo(threads * perThread);
        assertThat(maxInFlight.get()).isEqualTo(1);
    }
}
