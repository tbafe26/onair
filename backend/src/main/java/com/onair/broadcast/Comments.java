package com.onair.broadcast;

import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 댓글 모듈. 댓글의 규칙(길이, 작성자, 방송별 범위)을 한 곳에 둔다. REST adapter가 이 모듈을 부른다.
 * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
 */
@Service
class Comments {

    /** 채팅 WebSocket 메시지 종류. 계약 파일 contracts/chat.json과 같아야 한다. */
    static final String CHAT_COMMENT = "comment";

    private final CommentRepository comments;
    private final BroadcastRepository broadcasts;
    private final AppUserRepository users;
    private final Clock clock;
    /** 채팅 구독 표. 방송 중인 라이브방송 하나에 구독자 묶음 하나이고, 서버 메모리에만 둔다(서버 한 대 전제). */
    private final Map<Long, Set<Peer>> subscribers = new HashMap<>();

    Comments(CommentRepository comments, BroadcastRepository broadcasts, AppUserRepository users, Clock clock) {
        this.comments = comments;
        this.broadcasts = broadcasts;
        this.users = users;
        this.clock = clock;
    }

    /** 최신순 한 묶음. 방송이 없으면 404, size가 1 미만이면 400, null이면 기본값이고 50을 넘으면 50으로 줄인다. */
    @Transactional(readOnly = true)
    CommentPage list(long broadcastId, Long before, Integer requestedSize) {
        requireBroadcast(broadcastId);
        int size = requestedSize == null ? BroadcastService.DEFAULT_PAGE_SIZE : requestedSize;
        if (size < 1) {
            throw new InvalidRequestException(List.of(new FieldViolation("size", "size는 1 이상이어야 합니다")));
        }
        size = Math.min(size, BroadcastService.MAX_PAGE_SIZE);
        // 한 건 더 읽어 다음 묶음이 있는지 판단한다.
        List<Comment> found = comments.findBefore(
                broadcastId, before == null ? Long.MAX_VALUE : before, PageRequest.of(0, size + 1));
        List<CommentView> items = found.stream().limit(size).map(CommentView::of).toList();
        Long nextCursor = found.size() > size ? items.getLast().id() : null;
        return new CommentPage(items, nextCursor, comments.countOf(broadcastId));
    }

    /** 댓글을 쓴다. 로그인(401), 방송 존재(404), 내용 규칙(400) 순으로 확인한다. */
    @Transactional
    CommentView write(long broadcastId, Long userId, String rawContent) {
        AppUser author = requireUser(userId);
        Broadcast broadcast = requireBroadcast(broadcastId);
        boolean chat = broadcast instanceof LiveBroadcast;
        if (broadcast instanceof LiveBroadcast live && !live.isOnAir()) {
            throw new ChatClosedException(broadcastId);
        }
        String content = validate(rawContent);
        CommentView view = CommentView.of(comments.save(new Comment(broadcast, author, content, Instant.now(clock))));
        if (chat) {
            // 커밋 뒤에 보내야 구독자가 받은 채팅을 곧바로 REST로 읽을 수 있다.
            afterCommit(() -> publish(broadcastId, view));
        }
        return view;
    }

    /** 채팅 구독을 시작한다. 방송 중인 라이브방송만 구독자로 받고, 종료된 방송은 바로 ended를 보내고 닫는다. */
    synchronized void subscribe(long broadcastId, Peer peer) {
        // 확인과 등록을 같은 잠금 안에서 해야 종료 알림(endChat)을 놓치지 않는다.
        if (!(broadcasts.findById(broadcastId).orElse(null) instanceof LiveBroadcast live)) {
            peer.close();
            return;
        }
        if (!live.isOnAir()) {
            peer.send(SignalMessage.of(SignalMessage.ENDED));
            peer.close();
            return;
        }
        subscribers.computeIfAbsent(broadcastId, id -> new LinkedHashSet<>()).add(peer);
    }

    synchronized void unsubscribe(Peer peer) {
        subscribers.values().forEach(peers -> peers.remove(peer));
        subscribers.values().removeIf(Set::isEmpty);
    }

    /** 라이브방송이 끝났다. 송출 모듈이 종료 경로에서 부른다. 구독자 전원에게 ended를 보내고 닫는다. */
    synchronized void endChat(long broadcastId) {
        Set<Peer> peers = subscribers.remove(broadcastId);
        if (peers == null) {
            return;
        }
        for (Peer peer : peers) {
            peer.send(SignalMessage.of(SignalMessage.ENDED));
            peer.close();
        }
    }

    private synchronized void publish(long broadcastId, CommentView view) {
        for (Peer peer : subscribers.getOrDefault(broadcastId, Set.of())) {
            peer.send(SignalMessage.of(CHAT_COMMENT, "comment", view));
        }
    }

    private static void afterCommit(Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    action.run();
                }
            });
        } else {
            action.run();
        }
    }

    /** 댓글을 지운다. 로그인(401), 방송과 댓글 존재(404, 다른 방송의 댓글 포함), 작성자(403) 순으로 확인한다. */
    @Transactional
    void delete(long broadcastId, long commentId, Long userId) {
        long requester = requireUserId(userId);
        Broadcast broadcast = requireBroadcast(broadcastId);
        Comment comment = comments.findById(commentId)
                .filter(found -> found.broadcastId() == broadcastId)
                .orElseThrow(() -> new CommentNotFoundException(commentId));
        if (broadcast instanceof LiveBroadcast) {
            throw new ChatNotDeletableException(commentId);
        }
        if (!comment.isWrittenBy(requester)) {
            throw new CommentForbiddenException(commentId);
        }
        comments.delete(comment);
    }

    /** 방송을 지우기 전에 그 방송의 댓글을 모두 지운다. 부르는 쪽의 트랜잭션 안에서 실행된다. */
    @Transactional
    void deleteAllOf(long broadcastId) {
        comments.deleteAllOf(broadcastId);
    }

    private Broadcast requireBroadcast(long broadcastId) {
        return broadcasts.findById(broadcastId).orElseThrow(() -> new BroadcastNotFoundException(broadcastId));
    }

    private AppUser requireUser(Long userId) {
        return users.findById(requireUserId(userId)).orElseThrow(AuthenticationRequiredException::new);
    }

    private static long requireUserId(Long userId) {
        if (userId == null) {
            throw new AuthenticationRequiredException();
        }
        return userId;
    }

    private static String validate(String rawContent) {
        String content = rawContent == null ? "" : rawContent.strip();
        if (content.isEmpty()) {
            throw new InvalidRequestException(List.of(new FieldViolation("content", "내용을 입력하세요")));
        }
        if (content.length() > Comment.MAX_LENGTH) {
            throw new InvalidRequestException(List.of(new FieldViolation(
                    "content", "내용은 " + Comment.MAX_LENGTH + "자 이하로 입력하세요")));
        }
        return content;
    }
}
