package com.onair.comment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.onair.broadcast.StartLiveCommand;
import com.onair.live.ChatMessage;
import com.onair.live.ChatSubscriber;
import com.onair.live.LiveBroadcasting;
import com.onair.live.LiveChat;
import com.onair.live.RecordingSubscriber;
import com.onair.support.ApiTestSupport;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 채팅의 동시성: 느린 구독자가 다른 방송을 막지 않고, 같은 방송의 쓰기끼리 기다리지 않으며, 종료 뒤에는 채팅이 저장되지 않는다. */
class LiveChatConcurrencyTest extends ApiTestSupport {

    @Autowired
    Comments comments;

    @Autowired
    LiveChat chat;

    @Autowired
    LiveBroadcasting live;

    @Autowired
    PlatformTransactionManager transactionManager;

    final ExecutorService executor = Executors.newCachedThreadPool();

    @AfterEach
    void 스레드를_정리한다() {
        executor.shutdownNow();
    }

    long 방송을_시작한다(String title) {
        return live.start(new StartLiveCommand(title, null), owner().userId()).broadcastId();
    }

    /** 보내는 중에 멈춰 서는 구독자. 느린 연결을 흉내 낸다. */
    static final class StuckSubscriber implements ChatSubscriber {

        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);

        @Override
        public void send(ChatMessage message) {
            entered.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }

        @Override
        public void close() {
        }
    }

    @Test
    void 느린_구독자가_있어도_다른_방송의_채팅과_구독은_막히지_않는다() throws Exception {
        long userId = owner().userId();
        long slowRoom = 방송을_시작한다("느린 방");
        long otherRoom = 방송을_시작한다("다른 방");
        StuckSubscriber stuck = new StuckSubscriber();
        chat.subscribe(slowRoom, stuck);
        RecordingSubscriber fast = new RecordingSubscriber();
        chat.subscribe(otherRoom, fast);
        Future<?> blocked = executor.submit(() -> comments.write(slowRoom, userId, "느린 쪽"));
        assertThat(stuck.entered.await(5, TimeUnit.SECONDS)).isTrue();

        Future<?> other = executor.submit(() -> {
            comments.write(otherRoom, userId, "다른 쪽");
            chat.subscribe(otherRoom, new RecordingSubscriber());
        });

        try {
            other.get(3, TimeUnit.SECONDS);
        } finally {
            stuck.release.countDown();
        }
        blocked.get(5, TimeUnit.SECONDS);
        assertThat(fast.types()).containsExactly("comment");
    }

    /** 커밋하지 않고 붙든 채팅 쓰기. commit을 내리면 커밋한다. */
    record HeldWrite(CountDownLatch commit, Future<?> future) {

        void 커밋한다() throws Exception {
            commit.countDown();
            future.get(5, TimeUnit.SECONDS);
        }
    }

    HeldWrite 커밋하지_않고_쓴다(long id, long userId, String content) throws InterruptedException {
        CountDownLatch written = new CountDownLatch(1);
        CountDownLatch commit = new CountDownLatch(1);
        Future<?> future = executor.submit(() -> new TransactionTemplate(transactionManager)
                .executeWithoutResult(status -> {
                    comments.write(id, userId, content);
                    written.countDown();
                    try {
                        commit.await(10, TimeUnit.SECONDS);
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                }));
        assertThat(written.await(5, TimeUnit.SECONDS)).isTrue();
        return new HeldWrite(commit, future);
    }

    @Test
    void 같은_방송의_채팅_쓰기는_서로를_기다리지_않는다() throws Exception {
        long userId = owner().userId();
        long id = 방송을_시작한다("인기 방송");
        HeldWrite first = 커밋하지_않고_쓴다(id, userId, "먼저");

        Future<?> second = executor.submit(() -> comments.write(id, userId, "다음"));

        try {
            second.get(3, TimeUnit.SECONDS);
        } finally {
            first.커밋한다();
        }
        assertThat(comments.list(id, null, null).items()).extracting(CommentView::content).containsExactlyInAnyOrder("먼저", "다음");
    }

    @Test
    void 진행_중인_채팅_쓰기가_모두_끝나야_방송이_종료되고_그_뒤에는_채팅이_저장되지_않는다() throws Exception {
        long userId = owner().userId();
        long id = 방송을_시작한다("종료 경쟁");
        HeldWrite first = 커밋하지_않고_쓴다(id, userId, "끝나기 직전 1");
        HeldWrite second = 커밋하지_않고_쓴다(id, userId, "끝나기 직전 2");

        Future<?> ending = executor.submit(() -> live.endByOwner(id, userId));

        assertThatThrownBy(() -> ending.get(500, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
        first.커밋한다();
        assertThatThrownBy(() -> ending.get(500, TimeUnit.MILLISECONDS)).isInstanceOf(TimeoutException.class);
        second.커밋한다();
        ending.get(5, TimeUnit.SECONDS);
        assertThat(comments.list(id, null, null).items()).extracting(CommentView::content)
                .containsExactlyInAnyOrder("끝나기 직전 1", "끝나기 직전 2");
        assertThatThrownBy(() -> comments.write(id, userId, "늦은 글")).isInstanceOf(ChatClosedException.class);
    }
}
