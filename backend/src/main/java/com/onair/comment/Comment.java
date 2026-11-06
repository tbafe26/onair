package com.onair.comment;

import com.onair.auth.AppUser;
import com.onair.broadcast.Broadcast;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;

/** 댓글. 녹화방송 댓글과 (이후의) 라이브방송 채팅이 같은 개념이다. 테이블 이름은 H2 예약어(comment)를 피한다. */
@Entity
@Table(name = "broadcast_comment")
public class Comment {

    public static final int MAX_LENGTH = 300;

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "broadcast_id", nullable = false)
    private Broadcast broadcast;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "author_id", nullable = false)
    private AppUser author;

    @Column(nullable = false, length = MAX_LENGTH)
    private String content;

    @Column(nullable = false)
    private Instant createdAt;

    protected Comment() {
    }

    Comment(Broadcast broadcast, AppUser author, String content, Instant createdAt) {
        this.broadcast = broadcast;
        this.author = author;
        this.content = content;
        this.createdAt = createdAt;
    }

    Long getId() {
        return id;
    }

    long broadcastId() {
        return broadcast.getId();
    }

    AppUser getAuthor() {
        return author;
    }

    String getContent() {
        return content;
    }

    Instant getCreatedAt() {
        return createdAt;
    }

    boolean isWrittenBy(long userId) {
        return author.getId() == userId;
    }
}
