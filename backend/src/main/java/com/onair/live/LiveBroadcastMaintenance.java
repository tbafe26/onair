package com.onair.live;

import java.time.Clock;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 송출 모듈의 정리 작업을 때맞춰 부르는 얇은 adapter: 서버가 켜질 때 남은 방송을 종료하고,
 * 주기적으로 연락이 끊긴 방송을 종료한다. 종료 규칙은 모두 LiveBroadcasting에 있다.
 * 테스트 설정에서는 app.live.maintenance.enabled=false로 꺼 둔다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(name = "app.live.maintenance.enabled", havingValue = "true", matchIfMissing = true)
class LiveBroadcastMaintenance implements ApplicationRunner {

    private final LiveBroadcasting live;
    private final Clock clock;

    @Autowired
    LiveBroadcastMaintenance(LiveBroadcasting live, Clock clock) {
        this.live = live;
        this.clock = clock;
    }

    @Override
    public void run(ApplicationArguments args) {
        live.endAllOnAir();
    }

    @Scheduled(fixedDelay = 5_000)
    void expireSilentBroadcasters() {
        live.expireSilentBroadcasters(Instant.now(clock));
    }
}
