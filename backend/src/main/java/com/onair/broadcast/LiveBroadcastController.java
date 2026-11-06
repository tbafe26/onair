package com.onair.broadcast;

import com.onair.auth.AuthenticatedUser;
import java.net.URI;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 라이브방송 시작 요청을 송출 모듈에 넘기는 adapter. 종료는 시그널링 WebSocket 또는 BroadcastController의 end로 한다. */
@RestController
@RequestMapping("/api/broadcasts/live")
class LiveBroadcastController {

    private final LiveBroadcasting live;

    LiveBroadcastController(LiveBroadcasting live) {
        this.live = live;
    }

    /** 송출 키는 이 응답에만 담기고, 어떤 조회 응답에도 나오지 않는다. */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<StartedLiveResponse> start(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) MultipartFile thumbnail,
            @AuthenticationPrincipal AuthenticatedUser user) {
        StartedLive started = live.start(new StartLiveCommand(title, thumbnail), AuthenticatedUser.idOf(user));
        return ResponseEntity
                .created(URI.create(BroadcastResponses.location(started.broadcastId())))
                .body(new StartedLiveResponse(started.broadcastId(), started.streamKey()));
    }

    record StartedLiveResponse(long id, String streamKey) {

        @Override
        public String toString() {
            return "StartedLiveResponse[id=" + id + "]";
        }
    }
}
