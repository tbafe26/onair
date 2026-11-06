package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;

/** 댓글 모듈의 채팅: 기록용 Peer로 구독자가 새 채팅과 ended를 받는지 확인한다. */
class LiveChatTest extends ApiTestSupport {

    @Autowired
    Comments comments;

    @Autowired
    LiveBroadcasting live;

    @Autowired
    BroadcastService broadcasts;

    long 방송을_시작한다() {
        return live.start(new StartLiveCommand("채팅 방송", null), owner().userId()).broadcastId();
    }

    @Test
    void 구독자는_방송_중에_쓴_채팅을_받는다() {
        long id = 방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(id, subscriber);

        CommentView written = comments.write(id, owner().userId(), "안녕");

        assertThat(subscriber.types()).containsExactly("comment");
        assertThat(subscriber.last().fields().get("comment")).isEqualTo(written);
        assertThat(subscriber.closed).isFalse();
    }

    @Test
    void 구독을_끊은_연결은_더_받지_않는다() {
        long id = 방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(id, subscriber);
        comments.unsubscribe(subscriber);

        comments.write(id, owner().userId(), "안녕");

        assertThat(subscriber.received).isEmpty();
    }

    @Test
    void 다른_방송의_채팅은_받지_않는다() {
        long id = 방송을_시작한다();
        long other = live.start(new StartLiveCommand("다른 방송", null), owner().userId()).broadcastId();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(id, subscriber);

        comments.write(other, owner().userId(), "딴 방송");

        assertThat(subscriber.received).isEmpty();
    }

    @Test
    void 녹화방송_댓글은_구독자에게_가지_않는다() {
        long recording = 녹화방송을_올린다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(recording, subscriber);

        comments.write(recording, owner().userId(), "댓글");

        assertThat(subscriber.received).isEmpty();
    }

    @Test
    void 방송이_어떤_경로로든_끝나면_구독자는_ended를_받고_연결이_닫힌다() {
        long id = 방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(id, subscriber);

        live.endByOwner(id, owner().userId());

        assertThat(subscriber.types()).containsExactly("ended");
        assertThat(subscriber.closed).isTrue();
    }

    @Test
    void 송출자가_끝내도_구독자는_ended를_받는다() {
        var started = live.start(new StartLiveCommand("채팅 방송", null), owner().userId());
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.broadcastId(), started.streamKey(), owner().userId(), broadcaster);
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(started.broadcastId(), subscriber);

        live.relay(broadcaster, SignalMessage.of(SignalMessage.END));

        assertThat(subscriber.types()).containsExactly("ended");
        assertThat(subscriber.closed).isTrue();
    }

    @Test
    void 하트비트가_끊겨_방송이_정리돼도_구독자는_ended를_받는다() {
        long id = 방송을_시작한다();
        RecordingSubscriber subscriber = new RecordingSubscriber();
        comments.subscribe(id, subscriber);

        live.expireSilentBroadcasters(clock.instant().plus(LiveBroadcasting.SILENCE_LIMIT).plusSeconds(1));

        assertThat(subscriber.types()).containsExactly("ended");
        assertThat(subscriber.closed).isTrue();
    }

    @Test
    void 종료된_방송을_구독하면_바로_ended를_받고_닫힌다() {
        long id = 방송을_시작한다();
        live.endByOwner(id, owner().userId());
        RecordingSubscriber late = new RecordingSubscriber();

        comments.subscribe(id, late);

        assertThat(late.types()).containsExactly("ended");
        assertThat(late.closed).isTrue();
    }

    @Test
    void 없는_방송이나_녹화방송을_구독하면_아무것도_받지_않고_닫힌다() {
        RecordingSubscriber missing = new RecordingSubscriber();
        comments.subscribe(999_999, missing);
        long recording = 녹화방송을_올린다();
        RecordingSubscriber onRecording = new RecordingSubscriber();
        comments.subscribe(recording, onRecording);

        assertThat(missing.received).isEmpty();
        assertThat(missing.closed).isTrue();
        assertThat(onRecording.received).isEmpty();
        assertThat(onRecording.closed).isTrue();
    }

    @Test
    void 종료된_라이브방송에_쓰면_거절하고_구독자에게도_가지_않는다() {
        long id = 방송을_시작한다();
        live.endByOwner(id, owner().userId());

        assertThatThrownBy(() -> comments.write(id, owner().userId(), "늦은 글"))
                .isInstanceOf(ChatClosedException.class);
    }

    @Test
    void 라이브방송의_채팅은_지울_수_없다() {
        long id = 방송을_시작한다();
        long commentId = comments.write(id, owner().userId(), "지울 수 없다").id();

        assertThatThrownBy(() -> comments.delete(id, commentId, owner().userId()))
                .isInstanceOf(ChatNotDeletableException.class);
    }

    private long 녹화방송을_올린다() {
        byte[] mp4 = {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};
        MultipartFile video = new MockMultipartFile("video", "a.mp4", "video/mp4", mp4);
        return broadcasts.register(new RegistrationForm("녹화", video, null, null), owner().userId()).getId();
    }
}
