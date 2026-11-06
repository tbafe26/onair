package com.onair.donation;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 방송별 후원 내역 조회 요청을 넘기는 adapter. 로그인 없이 볼 수 있다. */
@RestController
@RequestMapping("/api/broadcasts/{id}/donations")
class DonationHistoryController {

    private final DonationHistory history;

    DonationHistoryController(DonationHistory history) {
        this.history = history;
    }

    @GetMapping
    DonationPage list(
            @PathVariable long id,
            @RequestParam(required = false) String cursor,
            @RequestParam(required = false) Integer size) {
        return history.list(id, cursor, size);
    }
}
