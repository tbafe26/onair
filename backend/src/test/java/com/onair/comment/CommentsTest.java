package com.onair.comment;

import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.onair.broadcast.StartLiveCommand;
import com.onair.live.LiveBroadcasting;
import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;

/** 댓글 모듈의 규칙: 구독자나 WebSocket 없이 저장된 댓글의 규칙만 확인한다. */
class CommentsTest extends ApiTestSupport {

    @Autowired
    Comments comments;

    @Autowired
    LiveBroadcasting live;

    long 방송을_시작한다() {
        return live.start(new StartLiveCommand("채팅 방송", null), owner().userId()).broadcastId();
    }

    @Test
    void 종료된_라이브방송에_쓰면_거절한다() {
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
}
