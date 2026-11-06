package com.onair.broadcast;

import jakarta.persistence.Column;
import jakarta.persistence.DiscriminatorColumn;
import jakarta.persistence.DiscriminatorType;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import com.onair.auth.AppUser;
import jakarta.persistence.FetchType;
import jakarta.persistence.Inheritance;
import jakarta.persistence.InheritanceType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import java.time.Instant;
import java.util.List;

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

    // 소유자가 생기기 전에 올라온 방송이 있는 DB를 위해 NOT NULL을 걸지 않는다. 그런 방송은 서버가 시작할 때 지운다.
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_id")
    private AppUser owner;

    protected Broadcast() {
    }

    protected Broadcast(String title, Instant createdAt, AppUser owner) {
        this.title = title;
        this.createdAt = createdAt;
        this.owner = owner;
    }

    public Long getId() {
        return id;
    }

    public String getTitle() {
        return title;
    }

    public AppUser getOwner() {
        return owner;
    }

    /** 소유자가 이 사용자인지. 소유자가 없는 방송(옛 데이터)은 누구의 것도 아니다. */
    boolean isOwnedBy(long userId) {
        return owner != null && owner.getId() == userId;
    }

    void rename(String newTitle) {
        this.title = newTitle;
    }

    public abstract BroadcastKind getKind();

    public Instant getCreatedAt() {
        return createdAt;
    }

    /** 썸네일 저장 키. 썸네일이 없으면 null이다. */
    abstract String thumbnailKey();

    /** 송출 중인지. 녹화방송은 송출하지 않으므로 항상 false다. */
    abstract boolean isOnAir();

    /** 지금 지울 수 있는지. 방송 중인 라이브방송만 지울 수 없다. */
    abstract boolean canDeleteNow();

    /** 지금 댓글을 받는지. 라이브방송은 방송 중일 때만 받는다. */
    abstract boolean acceptsCommentsNow();

    /** 댓글을 지울 수 있는지. 라이브방송의 채팅은 지울 수 없다. */
    abstract boolean commentsDeletable();

    /** 댓글이 실시간 채팅인지. 채팅은 구독자에게 보내고 구독을 받는다. */
    abstract boolean isChat();

    /** 소유자가 송출을 종료할 수 있는 방송인지. */
    abstract boolean canEndStream();

    /** 방송을 지울 때 함께 지울 저장소 파일 키. */
    abstract List<String> ownedFileKeys();
}
