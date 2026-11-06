package com.onair.donation;

/** 후원 주문 응답. 화면이 결제창을 여는 데 필요한 값이다. 닉네임과 메시지는 싣지 않는다. */
public record DonationOrder(String orderId, long amount, String orderName, String clientKey) {
}
