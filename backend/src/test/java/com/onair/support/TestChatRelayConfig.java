package com.onair.support;

import com.onair.live.ChatMessage;
import com.onair.live.ChatRelay;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 서버 한 대 테스트용 채팅 통로. PostgreSQL 통로처럼 커밋될 때만 전하지만, 다른 스레드가 아니라 커밋한 스레드에서 바로 전해
 * 기존 테스트가 기다리지 않고 받은 메시지를 확인할 수 있다. 서버를 넘는 실제 통로는 CrossServerChatTest가 확인한다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class TestChatRelayConfig {

    @Bean
    @Primary
    ChatRelay inMemoryChatRelay() {
        return new ChatRelay() {
            private volatile Receiver receiver;

            @Override
            public void send(long broadcastId, ChatMessage message) {
                if (TransactionSynchronizationManager.isSynchronizationActive()) {
                    TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                        @Override
                        public void afterCommit() {
                            receiver.receive(broadcastId, message);
                        }
                    });
                } else {
                    receiver.receive(broadcastId, message);
                }
            }

            @Override
            public void onReceive(Receiver receiver) {
                this.receiver = receiver;
            }
        };
    }
}
