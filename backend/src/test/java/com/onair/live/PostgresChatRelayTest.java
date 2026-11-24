package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.support.ApiTestSupport;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** 채팅을 보낸 트랜잭션만 NOTIFY 커밋 잠금을 쥔 채 디스크 동기화를 기다리지 않는다. 후원과 종료는 그대로 기다린다. */
class PostgresChatRelayTest extends ApiTestSupport {

    @Autowired
    PostgresChatRelay relay;

    @Autowired
    PlatformTransactionManager transactionManager;

    String 보낸_트랜잭션의_synchronous_commit(ChatMessage message) {
        return new TransactionTemplate(transactionManager).execute(status -> {
            relay.send(1L, message);
            return jdbc.queryForObject("select current_setting('synchronous_commit')", String.class);
        });
    }

    @Test
    void 채팅을_보낸_트랜잭션은_동기_커밋을_끈다() {
        assertThat(보낸_트랜잭션의_synchronous_commit(ChatMessage.comment(Map.of("content", "안녕")))).isEqualTo("off");
    }

    @Test
    void 후원을_보낸_트랜잭션은_동기_커밋을_그대로_둔다() {
        assertThat(보낸_트랜잭션의_synchronous_commit(ChatMessage.donation(Map.of("amount", 1000)))).isEqualTo("on");
    }

    @Test
    void 종료를_보낸_트랜잭션은_동기_커밋을_그대로_둔다() {
        assertThat(보낸_트랜잭션의_synchronous_commit(ChatMessage.ended())).isEqualTo("on");
    }
}
