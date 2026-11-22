package com.onair.live;

import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

/**
 * 미디어 서버(MediaMTX)의 HTTP 인증을 송출 모듈에 넘기는 adapter. 2xx면 허용, 그 밖에는 거절이다.
 * 입구(Ingress)와 개발 서버 프록시가 넘기지 않는 경로라 바깥에서는 부를 수 없다.
 */
@RestController
class MediaAuthController {

    // 미디어 서버의 경로 이름. 송출 화면이 같은 모양(live/{방송 id})으로 WHIP 주소를 만든다.
    private static final Pattern LIVE_PATH = Pattern.compile("live/(\\d{1,18})");

    private final LiveBroadcasting live;

    MediaAuthController(LiveBroadcasting live) {
        this.live = live;
    }

    /** token은 WHIP 요청의 Authorization: Bearer 값(송출 키)이다. */
    record MediaAuthRequest(String action, String path, String token) {

        @Override
        public String toString() {
            return "MediaAuthRequest[action=" + action + ", path=" + path + "]";
        }
    }

    @PostMapping("/internal/media/auth")
    ResponseEntity<Void> authorize(@RequestBody MediaAuthRequest request) {
        Matcher path = LIVE_PATH.matcher(request.path() == null ? "" : request.path());
        boolean allowed = "publish".equals(request.action())
                && path.matches()
                && live.acceptsPublish(Long.parseLong(path.group(1)), request.token());
        return ResponseEntity.status(allowed ? HttpStatus.OK : HttpStatus.UNAUTHORIZED).build();
    }
}
