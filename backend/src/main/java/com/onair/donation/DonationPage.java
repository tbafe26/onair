package com.onair.donation;

import java.util.List;

/**
 * 후원 내역 한 묶음(최신순)과 방송 전체의 합계. nextCursor가 있으면 이 값을 cursor로 넘겨 다음 묶음을 받고,
 * 없으면 마지막이다. 커서는 클라이언트가 해석하지 않는 값이다.
 */
public record DonationPage(Total total, List<DonationView> items, String nextCursor) {

    /** 확정된 후원의 합계 금액과 건수. */
    public record Total(long amount, long count) {
    }
}
