package com.onair.support;

import com.onair.donation.PaymentGateway;
import com.onair.donation.PaymentResult;
import java.util.ArrayList;
import java.util.List;
import java.util.function.Function;

/**
 * 테스트용 결제 서비스. 기본은 요청한 값 그대로 승인(DONE)한다. 시나리오는 테스트가 정하고,
 * 모든 테스트가 컨텍스트 하나를 함께 쓰도록 빈으로 두므로 ApiTestSupport가 테스트마다 초기화한다.
 */
public final class FakePaymentGateway implements PaymentGateway {

    /** 결제 서비스로 간 승인 요청. */
    public record ConfirmCall(String paymentKey, String orderId, long amount) {
    }

    private final List<ConfirmCall> confirmCalls = new ArrayList<>();
    private final List<String> findCalls = new ArrayList<>();
    private volatile Function<ConfirmCall, PaymentResult> onConfirm = FakePaymentGateway::approve;
    private volatile Function<String, PaymentResult> onFind = paymentKey -> new PaymentResult.Rejected(
            "NOT_FOUND_PAYMENT", "존재하지 않는 결제 입니다.");

    static PaymentResult approve(ConfirmCall call) {
        return new PaymentResult.Paid("DONE", call.orderId(), call.amount(), call.paymentKey());
    }

    public void reset() {
        synchronized (this) {
            confirmCalls.clear();
            findCalls.clear();
        }
        onConfirm = FakePaymentGateway::approve;
        onFind = paymentKey -> new PaymentResult.Rejected("NOT_FOUND_PAYMENT", "존재하지 않는 결제 입니다.");
    }

    public void onConfirm(Function<ConfirmCall, PaymentResult> behavior) {
        onConfirm = behavior;
    }

    public void onFind(Function<String, PaymentResult> behavior) {
        onFind = behavior;
    }

    public synchronized List<ConfirmCall> confirmCalls() {
        return List.copyOf(confirmCalls);
    }

    public synchronized List<String> findCalls() {
        return List.copyOf(findCalls);
    }

    @Override
    public PaymentResult confirm(String paymentKey, String orderId, long amount) {
        ConfirmCall call = new ConfirmCall(paymentKey, orderId, amount);
        synchronized (this) {
            confirmCalls.add(call);
        }
        return onConfirm.apply(call);
    }

    @Override
    public PaymentResult find(String paymentKey) {
        synchronized (this) {
            findCalls.add(paymentKey);
        }
        return onFind.apply(paymentKey);
    }
}
