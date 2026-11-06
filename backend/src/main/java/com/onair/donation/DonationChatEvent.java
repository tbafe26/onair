package com.onair.donation;

import java.time.Instant;

/**
 * 채팅으로 나가는 확정 후원. 후원 응답({@link DonationView})에 방송의 새 합계를 더한 모양이고,
 * 주문 번호와 결제 키는 싣지 않는다. 필드는 contracts/chat.json의 donationFields와 같다.
 */
public record DonationChatEvent(long id, long amount, String message, DonationView.Donor donor, Instant confirmedAt,
        DonationPage.Total total) {

    static DonationChatEvent of(DonationView view, DonationPage.Total total) {
        return new DonationChatEvent(view.id(), view.amount(), view.message(), view.donor(), view.confirmedAt(), total);
    }
}
