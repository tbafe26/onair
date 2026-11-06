package com.onair.donation;

import com.onair.auth.AppUser;
import com.onair.broadcast.Broadcast;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** 후원. 받는 사람은 주문을 만들 때의 방송 소유자로 고정한다. */
@Entity
@Table(name = "donation")
public class Donation {

    public static final int MAX_MESSAGE_LENGTH = 100;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, unique = true, length = 64)
    private String orderId;

    // 승인 때 채운다. 같은 결제 키로 두 후원이 확정될 수 없도록 unique다(null은 여러 개 허용).
    @Column(unique = true)
    private String paymentKey;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "broadcast_id", nullable = false)
    private Broadcast broadcast;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "donor_id", nullable = false)
    private AppUser donor;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private AppUser recipient;

    @Column(nullable = false)
    private long amount;

    @Column(length = MAX_MESSAGE_LENGTH)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DonationStatus status;

    private String failureCode;

    @Column(nullable = false)
    private Instant createdAt;

    private Instant confirmedAt;

    protected Donation() {
    }

    Donation(String orderId, Broadcast broadcast, AppUser donor, AppUser recipient, long amount, String message,
            Instant createdAt) {
        this.orderId = orderId;
        this.broadcast = broadcast;
        this.donor = donor;
        this.recipient = recipient;
        this.amount = amount;
        this.message = message;
        this.status = DonationStatus.PENDING;
        this.createdAt = createdAt;
    }

    Long getId() {
        return id;
    }

    String getOrderId() {
        return orderId;
    }

    String getPaymentKey() {
        return paymentKey;
    }

    AppUser getDonor() {
        return donor;
    }

    long getAmount() {
        return amount;
    }

    String getMessage() {
        return message;
    }

    DonationStatus getStatus() {
        return status;
    }

    Instant getConfirmedAt() {
        return confirmedAt;
    }
}
