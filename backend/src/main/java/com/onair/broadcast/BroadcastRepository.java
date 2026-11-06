package com.onair.broadcast;

import jakarta.persistence.LockModeType;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

/** 방송 저장소. 목록과 상세는 방송 상위 타입으로 읽고, 종류별 정보는 응답 변환에서 구분한다. */
interface BroadcastRepository extends JpaRepository<Broadcast, Long> {

    /** id가 before보다 작은 방송을 id 역순(최신 등록순)으로 돌려준다. 페이지 크기는 Pageable이 정한다. */
    @Query("select b from Broadcast b where b.id < :before order by b.id desc")
    List<Broadcast> findBefore(@Param("before") long before, Pageable pageable);

    /** findBefore와 같되 녹화방송만 돌려준다. */
    @Query("select r from RecordingBroadcast r where r.id < :before order by r.id desc")
    List<Broadcast> findRecordingsBefore(@Param("before") long before, Pageable pageable);

    /** findBefore와 같되 라이브방송(방송 중과 종료 모두)만 돌려준다. */
    @Query("select l from LiveBroadcast l where l.id < :before order by l.id desc")
    List<Broadcast> findLiveBefore(@Param("before") long before, Pageable pageable);

    /** findBefore와 같되 소유자가 ownerId인 방송만 돌려준다. */
    @Query("select b from Broadcast b where b.owner.id = :ownerId and b.id < :before order by b.id desc")
    List<Broadcast> findOwnedBefore(@Param("ownerId") long ownerId, @Param("before") long before, Pageable pageable);

    @Query("select l from LiveBroadcast l where l.id = :id")
    Optional<LiveBroadcast> findLiveById(@Param("id") long id);

    /**
     * 행을 잠그고 읽는다. 채팅 쓰기와 방송 종료가 같은 행을 잠가 서로 기다리게 해, 종료가 확정된 뒤에는 채팅이 저장되지 않게 한다.
     * 잠금은 부른 쪽 트랜잭션이 끝날 때까지 유지된다.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select b from Broadcast b where b.id = :id")
    Optional<Broadcast> findByIdForUpdate(@Param("id") long id);

    /** findByIdForUpdate와 같되 라이브방송만 읽는다. */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select l from LiveBroadcast l where l.id = :id")
    Optional<LiveBroadcast> findLiveByIdForUpdate(@Param("id") long id);

    @Query("select l from LiveBroadcast l where l.status = com.onair.broadcast.LiveStatus.ON_AIR")
    List<LiveBroadcast> findOnAirLives();

    /** 영상 파일을 여는 요청용. 녹화방송이 아닌 id는 비어 있다. */
    @Query("select r from RecordingBroadcast r join fetch r.video where r.id = :id")
    Optional<RecordingBroadcast> findRecordingWithVideoById(@Param("id") long id);
}
