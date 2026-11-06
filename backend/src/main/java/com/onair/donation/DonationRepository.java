package com.onair.donation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface DonationRepository extends JpaRepository<Donation, Long> {

    @Modifying
    @Query("delete from Donation d where d.broadcast.id = :broadcastId")
    void deleteAllOf(@Param("broadcastId") long broadcastId);
}
