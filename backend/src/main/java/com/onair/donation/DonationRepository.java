package com.onair.donation;

import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

interface DonationRepository extends JpaRepository<Donation, Long> {

    @Modifying
    @Query("delete from Donation d where d.broadcast.id = :broadcastId")
    void deleteAllOf(@Param("broadcastId") long broadcastId);

    // 영속성 컨텍스트 밖에서도 후원자를 읽을 수 있게 함께 가져온다.
    @EntityGraph(attributePaths = "donor")
    Optional<Donation> findByOrderId(String orderId);

    /** 대기일 때만 확정으로 바꾼다. 한 번만 성공하며 바뀐 행 수(0 또는 1)를 돌려준다. */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query("update Donation d set d.status = com.onair.donation.DonationStatus.CONFIRMED,"
            + " d.paymentKey = :paymentKey, d.confirmedAt = :at"
            + " where d.id = :id and d.status = com.onair.donation.DonationStatus.PENDING")
    int confirmIfPending(@Param("id") long id, @Param("paymentKey") String paymentKey, @Param("at") Instant at);

    /** 대기일 때만 실패로 바꾸고 코드를 남긴다. */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query("update Donation d set d.status = com.onair.donation.DonationStatus.FAILED, d.failureCode = :code"
            + " where d.id = :id and d.status = com.onair.donation.DonationStatus.PENDING")
    int failIfPending(@Param("id") long id, @Param("code") String code);

    /** 대기일 때만 취소로 바꾸고 코드를 남긴다. */
    @Transactional
    @Modifying(clearAutomatically = true)
    @Query("update Donation d set d.status = com.onair.donation.DonationStatus.CANCELED, d.failureCode = :code"
            + " where d.id = :id and d.status = com.onair.donation.DonationStatus.PENDING")
    int cancelIfPending(@Param("id") long id, @Param("code") String code);
}
