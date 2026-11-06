package com.onair.donation;

import com.onair.api.CursorPaging;
import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.broadcast.BroadcastNotFoundException;
import com.onair.broadcast.BroadcastRepository;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 후원 내역 조회. 확정된 후원만 확정 시각(같으면 id)의 최신순으로 돌려주고 합계를 함께 준다. */
@Service
class DonationHistory {

    // 첫 묶음은 어떤 확정 시각과 id보다도 뒤에서 시작한다.
    private static final Instant LATEST = Instant.parse("9999-12-31T00:00:00Z");

    private final DonationRepository donations;
    private final BroadcastRepository broadcasts;

    DonationHistory(DonationRepository donations, BroadcastRepository broadcasts) {
        this.donations = donations;
        this.broadcasts = broadcasts;
    }

    /** 방송이 없으면 404, 커서가 잘못됐거나 size가 1 미만이면 400이다. */
    @Transactional(readOnly = true)
    DonationPage list(long broadcastId, String cursor, Integer requestedSize) {
        if (!broadcasts.existsById(broadcastId)) {
            throw new BroadcastNotFoundException(broadcastId);
        }
        Position after = Position.parse(cursor);
        CursorPaging.Slice<Donation> slice = CursorPaging.read(requestedSize,
                window -> donations.findConfirmedBefore(broadcastId, after.at(), after.id(), window));
        List<DonationView> items = slice.items().stream().map(DonationView::of).toList();
        String nextCursor = slice.hasNext() ? Position.of(slice.items().getLast()).format() : null;
        return new DonationPage(new DonationPage.Total(donations.confirmedAmountOf(broadcastId),
                donations.confirmedCountOf(broadcastId)), items, nextCursor);
    }

    // 마지막으로 읽은 후원의 위치. "확정 시각_id" 문자열로 주고받는다.
    private record Position(Instant at, long id) {

        static Position of(Donation donation) {
            return new Position(donation.getConfirmedAt(), donation.getId());
        }

        static Position parse(String cursor) {
            if (cursor == null) {
                return new Position(LATEST, Long.MAX_VALUE);
            }
            try {
                int split = cursor.lastIndexOf('_');
                return new Position(Instant.parse(cursor.substring(0, split)), Long.parseLong(cursor.substring(split + 1)));
            } catch (DateTimeParseException | NumberFormatException | StringIndexOutOfBoundsException e) {
                throw new InvalidRequestException(List.of(new FieldViolation("cursor", "cursor가 올바르지 않습니다")));
            }
        }

        String format() {
            return at + "_" + id;
        }
    }
}
