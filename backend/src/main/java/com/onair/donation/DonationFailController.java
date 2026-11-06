package com.onair.donation;

import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.auth.AuthenticatedUser;
import java.util.List;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 결제창의 실패·취소 알림을 후원 모듈에 넘기는 adapter. 후원자 확인과 상태 전이는 모듈이 한다. */
@RestController
@RequestMapping("/api/donations")
class DonationFailController {

    private final Donations donations;

    DonationFailController(Donations donations) {
        this.donations = donations;
    }

    @PostMapping("/{orderId}/fail")
    FailResponse fail(@PathVariable String orderId, @RequestBody(required = false) FailRequest request,
            @AuthenticationPrincipal AuthenticatedUser user) {
        String code = request == null || request.code() == null ? "" : request.code().strip();
        if (code.isEmpty()) {
            throw new InvalidRequestException(List.of(new FieldViolation("code", "실패 코드가 필요합니다")));
        }
        return new FailResponse(donations.recordFailure(AuthenticatedUser.idOf(user), orderId, code));
    }

    record FailRequest(String code) {
    }

    record FailResponse(DonationStatus status) {
    }
}
