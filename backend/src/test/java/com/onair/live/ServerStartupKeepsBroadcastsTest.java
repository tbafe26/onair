package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;

import com.onair.OnAirApplication;
import com.onair.broadcast.LiveStatus;
import com.onair.broadcast.StartLiveCommand;
import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/** 자동 확장으로 서버가 하나 더 떠도 진행 중인 방송은 그대로다. 같은 DB를 쓰는 서버를 정리 작업을 켠 채 띄운다. */
class ServerStartupKeepsBroadcastsTest extends ApiTestSupport {

    @Autowired
    LiveBroadcasting live;

    @Test
    void 서버가_새로_떠도_방송_중인_라이브방송은_종료되지_않는다() {
        StartedLive started = live.start(new StartLiveCommand("서버 2가 떠도 유지", null), owner().userId());

        try (ConfigurableApplicationContext secondServer = new SpringApplicationBuilder(OnAirApplication.class)
                .run("--server.port=0", "--app.live.maintenance.enabled=true")) {
            assertThat(secondServer.isActive()).isTrue();
            assertThat(repository.findLiveById(started.broadcastId()).orElseThrow().status()).isEqualTo(LiveStatus.ON_AIR);
        }
    }
}
