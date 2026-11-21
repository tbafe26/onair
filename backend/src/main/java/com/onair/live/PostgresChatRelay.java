package com.onair.live;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Savepoint;
import java.sql.Statement;
import java.util.Map;
import org.postgresql.PGConnection;
import org.postgresql.PGNotification;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.jdbc.autoconfigure.JdbcConnectionDetails;
import org.springframework.context.SmartLifecycle;
import org.springframework.jdbc.core.ConnectionCallback;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import tools.jackson.databind.json.JsonMapper;

/**
 * PostgreSQL NOTIFY로 보내고, 커넥션 풀 밖의 전용 연결 하나로 LISTEN해 받는다.
 *
 * <p>보내기는 호출한 쪽 트랜잭션 연결의 세이브포인트 안에서 한다. NOTIFY는 커밋될 때만 나가고, NOTIFY가 실패해도
 * 세이브포인트까지만 되돌려 저장(후원 확정 등)은 그대로 커밋된다.
 */
@Component
class PostgresChatRelay implements ChatRelay, SmartLifecycle {

    private record Envelope(long broadcastId, String type, Map<String, Object> fields) {
    }

    private static final Logger log = LoggerFactory.getLogger(PostgresChatRelay.class);
    private static final String CHANNEL = "chat";
    private static final int POLL_MILLIS = 500;
    private static final long RETRY_MILLIS = 1_000;

    private final JsonMapper json = JsonMapper.builder().build();
    private final JdbcTemplate jdbc;
    private final JdbcConnectionDetails db;
    private volatile Receiver receiver;
    private volatile boolean running;
    private Thread listener;

    PostgresChatRelay(JdbcTemplate jdbc, JdbcConnectionDetails db) {
        this.jdbc = jdbc;
        this.db = db;
    }

    @Override
    public void onReceive(Receiver receiver) {
        this.receiver = receiver;
    }

    @Override
    public void send(long broadcastId, ChatMessage message) {
        String payload = json.writeValueAsString(new Envelope(broadcastId, message.type(), message.fields()));
        jdbc.execute((ConnectionCallback<Void>) connection -> {
            // 트랜잭션 안이면 세이브포인트를 둔다. 실패한 문장은 PostgreSQL 트랜잭션 전체를 무효로 만들기 때문이다.
            Savepoint savepoint = connection.getAutoCommit() ? null : connection.setSavepoint();
            try (PreparedStatement notify = connection.prepareStatement("select pg_notify(?, ?)")) {
                notify.setString(1, CHANNEL);
                notify.setString(2, payload);
                notify.execute();
            } catch (SQLException e) {
                if (savepoint != null) {
                    connection.rollback(savepoint);
                }
                throw e;
            }
            if (savepoint != null) {
                connection.releaseSavepoint(savepoint);
            }
            return null;
        });
    }

    @Override
    public void start() {
        running = true;
        listener = Thread.ofPlatform().daemon().name("chat-relay").start(this::listen);
    }

    @Override
    public void stop() {
        running = false;
        if (listener == null) {
            return;
        }
        listener.interrupt();
        try {
            listener.join(POLL_MILLIS * 4L);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @Override
    public boolean isRunning() {
        return running;
    }

    private void listen() {
        boolean lostBefore = false;
        while (running) {
            try (Connection connection = DriverManager.getConnection(db.getJdbcUrl(), db.getUsername(), db.getPassword())) {
                try (Statement statement = connection.createStatement()) {
                    statement.execute("LISTEN " + CHANNEL);
                }
                if (lostBefore) {
                    // 끊긴 동안 온 알림은 다시 오지 않는다. 다시 들은 뒤에 한 번 더 닫아야, 끊긴 사이 접속한 화면도 빠진 채팅을 읽는다.
                    notifyMissed();
                    lostBefore = false;
                }
                PGConnection notifications = connection.unwrap(PGConnection.class);
                while (running) {
                    PGNotification[] received = notifications.getNotifications(POLL_MILLIS);
                    if (received != null) {
                        for (PGNotification notification : received) {
                            deliver(notification.getParameter());
                        }
                    }
                }
            } catch (SQLException | RuntimeException e) {
                // SQL 오류가 아닌 예외로도 이 스레드가 멈추면 이후 알림이 모두 끊기므로, 같은 방식으로 다시 연결한다.
                if (!running) {
                    return;
                }
                log.warn("채팅 알림 연결이 끊겨 다시 연결한다: {}", e.getClass().getSimpleName());
                if (!lostBefore) {
                    notifyMissed();
                }
                lostBefore = true;
                pause();
            }
        }
    }

    private void deliver(String payload) {
        Receiver current = receiver;
        if (current == null) {
            return;
        }
        try {
            Envelope envelope = json.readValue(payload, Envelope.class);
            current.receive(envelope.broadcastId(), new ChatMessage(envelope.type(), envelope.fields()));
        } catch (RuntimeException e) {
            log.warn("채팅 알림을 전하지 못했다: {}", e.getClass().getSimpleName());
        }
    }

    private void notifyMissed() {
        Receiver current = receiver;
        if (current == null) {
            return;
        }
        try {
            current.missedMessages();
        } catch (RuntimeException e) {
            log.warn("채팅 구독자를 닫지 못했다: {}", e.getClass().getSimpleName());
        }
    }

    private void pause() {
        try {
            Thread.sleep(RETRY_MILLIS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            running = false;
        }
    }
}
