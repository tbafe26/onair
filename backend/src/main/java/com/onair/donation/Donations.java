package com.onair.donation;

import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.api.Requester;
import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import com.onair.broadcast.Broadcast;
import com.onair.broadcast.BroadcastDeletionListener;
import com.onair.broadcast.BroadcastNotFoundException;
import com.onair.broadcast.BroadcastRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 후원 모듈. 주문 만들기의 규칙(금액, 메시지, 방송 상태, 받는 사람)을 한 곳에 둔다. REST adapter가 이 모듈을 부른다.
 * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
 */
@Service
public class Donations implements BroadcastDeletionListener {

    static final long MIN_AMOUNT = 1_000;
    static final long MAX_AMOUNT = 500_000;
    static final long AMOUNT_UNIT = 1_000;
    // 결제 서비스로 가는 유일한 문구다. 닉네임이나 메시지를 넣지 않는다.
    static final String ORDER_NAME = "온에어 방송 후원";

    private final DonationRepository donations;
    private final BroadcastRepository broadcasts;
    private final AppUserRepository users;
    private final TossSettings toss;
    private final PaymentGateway payments;
    private final Clock clock;

    Donations(DonationRepository donations, BroadcastRepository broadcasts, AppUserRepository users,
            TossSettings toss, PaymentGateway payments, Clock clock) {
        this.donations = donations;
        this.broadcasts = broadcasts;
        this.users = users;
        this.toss = toss;
        this.payments = payments;
        this.clock = clock;
    }

    /** 대기 후원을 만든다. 로그인(401), 방송 존재(404), 입력 규칙(400), 방송 중(409), 자기 방송(403), 결제 설정(503) 순으로 확인한다. */
    @Transactional
    public DonationOrder createOrder(long broadcastId, Long userId, Long rawAmount, String rawMessage) {
        AppUser donor = Requester.load(userId, users);
        Broadcast broadcast = broadcasts.findById(broadcastId)
                .orElseThrow(() -> new BroadcastNotFoundException(broadcastId));
        String message = normalizedMessage(rawMessage);
        long amount = validated(rawAmount, message);
        if (!broadcast.isOnAir()) {
            throw new DonationBroadcastNotOnAirException(broadcastId);
        }
        if (broadcast.isOwnedBy(donor.getId())) {
            throw new SelfDonationException(broadcastId);
        }
        if (!toss.configured()) {
            throw new PaymentNotConfiguredException();
        }
        String orderId = UUID.randomUUID().toString().replace("-", "");
        donations.save(new Donation(orderId, broadcast, donor, broadcast.getOwner(), amount, message,
                Instant.now(clock)));
        return new DonationOrder(orderId, amount, ORDER_NAME, toss.clientKey());
    }

    /**
     * 결제를 승인하고 후원을 확정한다. 본인 주문(401, 404, 403)이고, 이미 같은 결제로 확정됐으면 그 결과를 그대로 돌려준다.
     * 실패·취소는 409, 금액 불일치는 결제 서비스를 부르지 않고 실패로 기록해 400, 거절과 응답 불일치는 실패로 기록해 402다.
     * 결제 서비스를 부르는 동안 트랜잭션을 잡지 않고, 확정은 "대기일 때만 바꾸는" 조건부 갱신으로 한 번만 성공한다.
     * 방송이 이미 끝났어도 확정한다.
     */
    public DonationView confirm(Long userId, String paymentKey, String orderId, long amount) {
        long donorId = Requester.id(userId);
        Donation donation = donations.findByOrderId(orderId).orElseThrow(DonationNotFoundException::new);
        if (donation.getDonor().getId() != donorId) {
            throw new NotDonorException();
        }
        if (donation.getStatus() == DonationStatus.CONFIRMED) {
            return decided(donation, paymentKey);
        }
        if (donation.getStatus() != DonationStatus.PENDING) {
            throw new DonationNotPayableException();
        }
        if (amount != donation.getAmount()) {
            fail(donation, "AMOUNT_MISMATCH");
            throw new AmountMismatchException();
        }
        PaymentResult result = payments.confirm(paymentKey, orderId, amount);
        if (result instanceof PaymentResult.AlreadyProcessed) {
            result = payments.find(paymentKey);
        }
        switch (result) {
            case PaymentResult.Rejected rejected -> {
                fail(donation, rejected.code());
                throw new PaymentRejectedException(rejected.code());
            }
            case PaymentResult.AlreadyProcessed processed -> {
                fail(donation, TossPaymentGateway.ALREADY_PROCESSED);
                throw new PaymentRejectedException(TossPaymentGateway.ALREADY_PROCESSED);
            }
            case PaymentResult.Paid paid -> {
                if (!matches(paid, donation, paymentKey)) {
                    fail(donation, "PAYMENT_MISMATCH");
                    throw new PaymentRejectedException("PAYMENT_MISMATCH");
                }
            }
        }
        markConfirmed(donation, paymentKey);
        // 이긴 쪽과 진 쪽 모두 저장된 확정 결과를 읽어 돌려준다.
        return decided(donations.findByOrderId(orderId).orElseThrow(DonationNotFoundException::new), paymentKey);
    }

    /**
     * 결제 서비스의 승인 통지를 처리한다. 통지 본문은 믿지 않고 결제 키로 결제를 다시 조회해, 승인과 같은 대조와
     * 조건부 갱신으로 확정한다. 모르는 주문, 이미 끝난 주문, 조회 실패, 대조 실패는 아무것도 바꾸지 않고 돌아온다.
     */
    public void handlePaymentNotification(String paymentKey, String orderId) {
        Donation donation = donations.findByOrderId(orderId).orElse(null);
        if (donation == null || donation.getStatus() != DonationStatus.PENDING) {
            return;
        }
        try {
            if (payments.find(paymentKey) instanceof PaymentResult.Paid paid && matches(paid, donation, paymentKey)) {
                markConfirmed(donation, paymentKey);
            }
        } catch (PaymentGatewayUnavailableException | DonationNotPayableException e) {
            // 결제 서비스가 다시 통지하거나 사용자가 승인하면 된다.
        }
    }

    // 대기 후원을 확정한다. 이미 다른 요청이 확정했으면 아무것도 바꾸지 않는다.
    private void markConfirmed(Donation donation, String paymentKey) {
        try {
            donations.confirmIfPending(donation.getId(), paymentKey, Instant.now(clock));
        } catch (DataIntegrityViolationException e) {
            // 같은 결제 키가 다른 후원에 이미 쓰였다.
            throw new DonationNotPayableException();
        }
    }

    // 결제 서비스가 돌려준 결제가 저장된 후원과 맞는지 본다: 상태 DONE, 주문 번호, 금액, 결제 키.
    private static boolean matches(PaymentResult.Paid paid, Donation donation, String paymentKey) {
        return "DONE".equals(paid.status())
                && donation.getOrderId().equals(paid.orderId())
                && donation.getAmount() == paid.totalAmount()
                && paymentKey.equals(paid.paymentKey());
    }

    // 확정된 후원이면 같은 결제 키일 때만 결과를 돌려준다. 그 밖의 상태는 409다.
    private static DonationView decided(Donation donation, String paymentKey) {
        if (donation.getStatus() == DonationStatus.CONFIRMED && paymentKey.equals(donation.getPaymentKey())) {
            return DonationView.of(donation);
        }
        throw new DonationNotPayableException();
    }

    private void fail(Donation donation, String code) {
        donations.failIfPending(donation.getId(), code);
    }

    /** 방송을 지우기 전에 그 방송의 후원을 모두 지운다. 부르는 쪽의 트랜잭션 안에서 실행된다. */
    @Override
    @Transactional
    public void beforeDelete(long broadcastId) {
        donations.deleteAllOf(broadcastId);
    }

    // 금액과 메시지의 오류를 한 번에 모아 돌려준다.
    private static long validated(Long amount, String message) {
        List<FieldViolation> violations = new ArrayList<>();
        if (amount == null || amount < MIN_AMOUNT || amount > MAX_AMOUNT || amount % AMOUNT_UNIT != 0) {
            violations.add(new FieldViolation("amount", "금액은 1,000원 이상 500,000원 이하, 1,000원 단위로 입력하세요"));
        }
        if (message != null && message.length() > Donation.MAX_MESSAGE_LENGTH) {
            violations.add(new FieldViolation("message",
                    "메시지는 " + Donation.MAX_MESSAGE_LENGTH + "자 이하로 입력하세요"));
        }
        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
        return amount;
    }

    private static String normalizedMessage(String rawMessage) {
        if (rawMessage == null) {
            return null;
        }
        String message = rawMessage.strip();
        return message.isEmpty() ? null : message;
    }
}
