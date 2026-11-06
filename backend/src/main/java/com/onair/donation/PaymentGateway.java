package com.onair.donation;

/**
 * 결제 서비스 seam. 결제 서비스로는 결제 키, 주문 번호, 금액만 보낸다.
 * 서비스에 닿지 못하거나 서버 오류면 {@link PaymentGatewayUnavailableException}을 던진다.
 */
public interface PaymentGateway {

    PaymentResult confirm(String paymentKey, String orderId, long amount);

    PaymentResult find(String paymentKey);
}
