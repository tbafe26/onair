package com.onair.donation;

import java.time.Instant;

/** 확정된 후원의 응답. 주문 번호와 결제 키는 싣지 않는다. */
public record DonationView(long id, long amount, String message, Donor donor, Instant confirmedAt) {

    /** 후원자. */
    public record Donor(long id, String nickname) {
    }

    static DonationView of(Donation donation) {
        return new DonationView(donation.getId(), donation.getAmount(), donation.getMessage(),
                new Donor(donation.getDonor().getId(), donation.getDonor().getNickname()), donation.getConfirmedAt());
    }
}
