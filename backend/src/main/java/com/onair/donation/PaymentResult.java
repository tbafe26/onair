package com.onair.donation;

/** 결제 서비스 호출의 결과. 결제 정보, 거절, "이미 처리됨" 셋 중 하나다. */
public sealed interface PaymentResult {

    /** 결제가 완료됐을 때 Paid.status의 값. */
    String STATUS_DONE = "DONE";

    /** "이미 처리됨"을 실패로 기록할 때 남기는 코드. 토스가 같은 이름으로 돌려준다. */
    String ALREADY_PROCESSED_CODE = "ALREADY_PROCESSED_PAYMENT";

    /** 결제 서비스가 돌려준 결제. 승인 응답과 조회 응답이 같은 모양이다. */
    record Paid(String status, String orderId, long totalAmount, String paymentKey) implements PaymentResult {
    }

    /** 결제 서비스가 요청을 거절했다. code는 서비스의 오류 코드다. */
    record Rejected(String code, String message) implements PaymentResult {
    }

    /** 같은 결제를 이미 승인했다. 결제를 다시 조회해 판단한다. */
    record AlreadyProcessed() implements PaymentResult {
    }
}
