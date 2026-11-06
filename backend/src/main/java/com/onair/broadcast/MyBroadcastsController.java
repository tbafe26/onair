package com.onair.broadcast;

import com.onair.auth.AuthenticatedUser;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 내 방송 목록 요청을 방송 모듈에 넘기는 adapter. 로그인 여부는 방송 모듈이 판단한다. */
@RestController
@RequestMapping("/api/me/broadcasts")
class MyBroadcastsController {

    private final BroadcastService service;

    MyBroadcastsController(BroadcastService service) {
        this.service = service;
    }

    @GetMapping
    BroadcastPage list(
            @RequestParam(required = false) Long before,
            @RequestParam(required = false) Integer size,
            @AuthenticationPrincipal AuthenticatedUser user) {
        return service.listMine(user == null ? null : user.id(), before, size);
    }
}
