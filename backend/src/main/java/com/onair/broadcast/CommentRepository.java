package com.onair.broadcast;

import java.util.List;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface CommentRepository extends JpaRepository<Comment, Long> {

    /** id가 before보다 작은 댓글을 id 역순(최신순)으로 돌려준다. 작성자는 함께 읽는다. */
    @Query("select c from Comment c join fetch c.author where c.broadcast.id = :broadcastId and c.id < :before order by c.id desc")
    List<Comment> findBefore(@Param("broadcastId") long broadcastId, @Param("before") long before, Pageable pageable);

    @Query("select count(c) from Comment c where c.broadcast.id = :broadcastId")
    long countOf(@Param("broadcastId") long broadcastId);

    @Modifying
    @Query("delete from Comment c where c.broadcast.id = :broadcastId")
    void deleteAllOf(@Param("broadcastId") long broadcastId);
}
