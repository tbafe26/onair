package com.onair.comment;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.broadcast.StartLiveCommand;
import com.onair.live.LiveBroadcasting;
import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 채팅 커밋은 NOTIFY 커밋 잠금을 쥔 채 디스크 동기화를 기다리지 않는다. 녹화방송 댓글은 그대로 기다린다. */
class ChatCommitTest extends ApiTestSupport {

    @Autowired
    Comments comments;

    @Autowired
    LiveBroadcasting live;

    @Autowired
    PlatformTransactionManager transactionManager;

    /** 댓글을 쓴 트랜잭션 안에서 synchronous_commit 값을 읽는다. */
    String 댓글을_쓴_트랜잭션의_synchronous_commit(long broadcastId, long userId) {
        return new TransactionTemplate(transactionManager).execute(status -> {
            comments.write(broadcastId, userId, "안녕");
            return jdbc.queryForObject("select current_setting('synchronous_commit')", String.class);
        });
    }

    @Test
    void 채팅을_쓴_트랜잭션은_동기_커밋을_끈다() {
        long userId = owner().userId();
        long id = live.start(new StartLiveCommand("채팅", null), userId).broadcastId();

        assertThat(댓글을_쓴_트랜잭션의_synchronous_commit(id, userId)).isEqualTo("off");
    }

    @Test
    void 녹화방송_댓글을_쓴_트랜잭션은_동기_커밋을_그대로_둔다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "a.mp4", "video/mp4", RecordingCommentApiTest.MP4_BYTES))
                        .param("title", "영상"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");

        assertThat(댓글을_쓴_트랜잭션의_synchronous_commit(id, owner().userId())).isEqualTo("on");
    }
}
