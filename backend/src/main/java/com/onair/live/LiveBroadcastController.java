package com.onair.live;

import com.onair.auth.AuthenticatedUser;
import com.onair.broadcast.BroadcastResponses;
import com.onair.broadcast.StartLiveCommand;
import java.net.URI;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** 라이브방송의 시작과 소유자의 종료 요청을 송출 모듈에 넘기는 adapter. 송출자 연결로 끝내는 길은 시그널링 WebSocket이다. */
@RestController
class LiveBroadcastController {

    private final LiveBroadcasting live;

    LiveBroadcastController(LiveBroadcasting live) {
        this.live = live;
    }

    /** 송출 키는 이 응답에만 담기고, 어떤 조회 응답에도 나오지 않는다. */
    @PostMapping(value = "/api/broadcasts/live", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<StartedLiveResponse> start(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) MultipartFile thumbnail,
            @AuthenticationPrincipal AuthenticatedUser user) {
        StartedLive started = live.start(new StartLiveCommand(title, thumbnail), AuthenticatedUser.idOf(user));
        return ResponseEntity
                .created(URI.create(BroadcastResponses.location(started.broadcastId())))
                .body(new StartedLiveResponse(started.broadcastId(), started.streamKey()));
    }

    /** 소유자가 방송 중인 라이브방송을 종료한다. 이미 종료됐어도 204이고, 녹화방송은 409다. */
    @PostMapping("/api/broadcasts/{id}/end")
    ResponseEntity<Void> end(@PathVariable long id, @AuthenticationPrincipal AuthenticatedUser user) {
        live.endByOwner(id, AuthenticatedUser.idOf(user));
        return ResponseEntity.noContent().build();
    }

    record StartedLiveResponse(long id, String streamKey) {

        @Override
        public String toString() {
            return "StartedLiveResponse[id=" + id + "]";
        }
    }
}
