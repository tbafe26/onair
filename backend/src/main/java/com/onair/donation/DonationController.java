package com.onair.donation;

import com.onair.auth.AuthenticatedUser;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 후원 요청을 후원 모듈에 넘기는 adapter. 로그인 여부와 권한은 모듈이 판단한다. */
@RestController
@RequestMapping("/api/broadcasts/{id}/donations")
class DonationController {

    private final Donations donations;

    DonationController(Donations donations) {
        this.donations = donations;
    }

    @PostMapping
    ResponseEntity<DonationOrder> order(
            @PathVariable long id,
            @RequestBody(required = false) OrderRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        OrderRequest body = request == null ? new OrderRequest(null, null) : request;
        DonationOrder order = donations.createOrder(id, AuthenticatedUser.idOf(user), body.amount(), body.message());
        return ResponseEntity.status(HttpStatus.CREATED).body(order);
    }

    record OrderRequest(Long amount, String message) {
    }
}
