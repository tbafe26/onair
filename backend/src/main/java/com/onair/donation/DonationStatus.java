package com.onair.donation;

/** 후원의 진행 상태. 대기에서 확정, 실패, 취소 중 하나로만 바뀐다. */
public enum DonationStatus {
    PENDING,
    CONFIRMED,
    FAILED,
    CANCELED
}
