package com.onair.broadcast;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorColumn;
import jakarta.persistence.DiscriminatorType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import java.time.Instant;

/**
 * 방송: 녹화방송과 라이브방송이 공유하는 상위 개념.
 * JOINED 상속이라 공통 테이블(broadcast)과 종류별 자식 테이블이 같은 id를 쓴다.
 * 종류는 kind 컬럼(구분 컬럼)에 저장되며, 하위 클래스가 getKind()로 자기 종류를 돌려준다.
 */
@Entity
@Inheritance(strategy = InheritanceType.JOINED)
@DiscriminatorColumn(name = "kind", discriminatorType = DiscriminatorType.STRING, length = 20)
public abstract class Broadcast {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 100)
    private String title;

    @Column(nullable = false)
    private Instant createdAt;

    protected Broadcast() {
    }

    protected Broadcast(String title, Instant createdAt) {
        this.title = title;
        this.createdAt = createdAt;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public abstract BroadcastKind getKind();

    public Instant getCreatedAt() {
        return createdAt;
    }
}
