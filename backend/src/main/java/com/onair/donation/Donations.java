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
    private final Clock clock;

    Donations(DonationRepository donations, BroadcastRepository broadcasts, AppUserRepository users,
            TossSettings toss, Clock clock) {
        this.donations = donations;
        this.broadcasts = broadcasts;
        this.users = users;
        this.toss = toss;
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
