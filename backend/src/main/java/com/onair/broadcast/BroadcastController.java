package com.onair.broadcast;

import java.io.IOException;
import java.net.URI;
import java.time.Duration;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpRange;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/broadcasts")
class BroadcastController {

    private final BroadcastService service;

    BroadcastController(BroadcastService service) {
        this.service = service;
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    ResponseEntity<BroadcastDetail> register(
            @RequestParam(required = false) String title,
            @RequestParam(required = false) MultipartFile video,
            @RequestParam(required = false) MultipartFile thumbnail,
            @RequestParam(required = false) String durationSeconds) {
        Broadcast created = service.register(
                new RegistrationForm(title, video, thumbnail, durationSeconds));
        return ResponseEntity
                .created(URI.create(BroadcastResponses.location(created.getId())))
                .body(BroadcastResponses.detail(created));
    }

    /** 커서 방식 목록. before가 없으면 최신부터, size는 기본 20이고 50을 넘으면 50으로 줄이며 1 미만이면 400이다. */
    @GetMapping
    BroadcastPage list(
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size) {
        return service.list(before, size);
    }

    /** 업로드 크기 상한. 리터럴 경로라서 아래 /{id} 매핑보다 먼저 선택된다. */
    @GetMapping("/upload-policy")
    UploadPolicy uploadPolicy() {
        return service.uploadPolicy();
    }

    @GetMapping("/{id}")
    BroadcastDetail detail(@PathVariable long id) {
        return service.detail(id);
    }

    @GetMapping("/{id}/thumbnail")
    ResponseEntity<Resource> thumbnail(@PathVariable long id) {
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_JPEG)
                // 썸네일은 바뀌지 않으므로 오래 캐시한다.
                .cacheControl(CacheControl.maxAge(Duration.ofDays(365)).cachePublic().immutable())
                .body(service.thumbnail(id));
    }

    // Resource를 그대로 돌려주면 Spring MVC가 Range 헤더를 보고 206과 Content-Range를 처리한다.
    // 처리할 수 없는 범위는 Spring이 영상 전체를 실어 보내므로, 먼저 확인해 빈 본문의 416으로 돌려준다(ApiExceptionHandler가 ProblemDetail과 Content-Range를 만든다).
    @GetMapping("/{id}/video")
    ResponseEntity<Resource> video(@PathVariable long id, @RequestHeader HttpHeaders requestHeaders)
            throws IOException {
        BroadcastService.PlayableVideo video = service.video(id);
        if (!isSatisfiable(requestHeaders, video.resource())) {
            throw new RangeNotSatisfiableException(video.resource().contentLength());
        }
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(video.format().mediaType()))
                .body(video.resource());
    }

    private static boolean isSatisfiable(HttpHeaders requestHeaders, Resource resource) {
        try {
            HttpRange.toResourceRegions(requestHeaders.getRange(), resource);
            return true;
        } catch (IllegalArgumentException e) {
            return false;
        }
    }
}
