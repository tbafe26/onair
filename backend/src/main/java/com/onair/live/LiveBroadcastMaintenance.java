package com.onair.live;

import java.time.Clock;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 5초마다 미디어 서버의 송출 목록을 읽어 방송 상태를 맞추는 얇은 adapter. 종료 규칙은 모두 LiveBroadcasting에 있다.
 * 테스트 설정에서는 app.live.maintenance.enabled=false로 꺼 둔다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.live.maintenance.enabled", havingValue = "true", matchIfMissing = true)
class LiveBroadcastMaintenance {

    private static final Logger log = LoggerFactory.getLogger(LiveBroadcastMaintenance.class);

    private final LiveBroadcasting live;
    private final MediaServer media;
    private final Clock clock;

    @Autowired
    LiveBroadcastMaintenance(LiveBroadcasting live, MediaServer media, Clock clock) {
        this.live = live;
        this.media = media;
        this.clock = clock;
    }

    /** 송출 목록을 못 읽으면 송출이 없다고 단정할 수 없으므로 이번 차례는 건너뛴다. */
    @Scheduled(fixedDelay = 5_000)
    void reconcileWithMediaServer() {
        try {
            live.reconcile(media.publishingBroadcasts(), Instant.now(clock));
        } catch (MediaServerUnavailableException e) {
            log.warn("방송 상태를 맞추지 못했습니다: {}", e.getMessage());
        }
    }
}
