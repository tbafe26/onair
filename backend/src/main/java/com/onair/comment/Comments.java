package com.onair.comment;

import com.onair.api.CursorPaging;
import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.api.Requester;
import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import com.onair.broadcast.Broadcast;
import com.onair.broadcast.BroadcastNotFoundException;
import com.onair.broadcast.BroadcastRepository;
import com.onair.live.ChatMessage;
import com.onair.live.ChatSubscriber;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 댓글 모듈. 댓글의 규칙(길이, 작성자, 방송별 범위)을 한 곳에 둔다. REST adapter가 이 모듈을 부른다.
 * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
 */
@Service
public class Comments {

    private final CommentRepository comments;
    private final BroadcastRepository broadcasts;
    private final AppUserRepository users;
    private final Clock clock;
    /** 채팅 구독 표. 방송 중인 라이브방송 하나에 구독자 묶음 하나이고, 서버 메모리에만 둔다(서버 한 대 전제). */
    private final Map<Long, Set<ChatSubscriber>> subscribers = new ConcurrentHashMap<>();

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
        long cursor = CursorPaging.cursor(before);
        CursorPaging.Slice<Comment> slice = CursorPaging.read(
                requestedSize, window -> comments.findBefore(broadcastId, cursor, window));
        List<CommentView> items = slice.items().stream().map(CommentView::of).toList();
        Long nextCursor = slice.hasNext() ? items.getLast().id() : null;
        return new CommentPage(items, nextCursor, comments.countOf(broadcastId));
    }

    /** 댓글을 쓴다. 로그인(401), 방송 존재(404), 내용 규칙(400) 순으로 확인한다. */
    @Transactional
    public CommentView write(long broadcastId, Long userId, String rawContent) {
        AppUser author = Requester.load(userId, users);
        // 행을 잠그고 읽는다. 방송 종료도 같은 행을 잠그므로, 방송 중 확인과 저장 사이에 종료가 끼어들 수 없다.
        Broadcast broadcast = broadcasts.findByIdForUpdate(broadcastId)
                .orElseThrow(() -> new BroadcastNotFoundException(broadcastId));
        // 라이브방송의 댓글이 채팅이다. 방송 중일 때만 쓸 수 있다.
        if (!broadcast.acceptsCommentsNow()) {
            throw new ChatClosedException(broadcastId);
        }
        String content = validate(rawContent);
        CommentView view = CommentView.of(comments.save(new Comment(broadcast, author, content, Instant.now(clock))));
        if (broadcast.isChat()) {
            // 커밋 뒤에 보내야 구독자가 받은 채팅을 곧바로 REST로 읽을 수 있다.
            afterCommit(() -> publish(broadcastId, view));
        }
        return view;
    }

    /** 채팅 구독을 시작한다. 방송 중인 라이브방송만 구독자로 받고, 종료된 방송은 바로 ended를 보내고 닫는다. */
    public void subscribe(long broadcastId, ChatSubscriber subscriber) {
        // 먼저 등록하고 나중에 상태를 읽는다. 읽는 사이에 방송이 끝나도 endChat이나 아래 확인 중 한쪽이 ended를 보낸다.
        // 전역 잠금이 없으므로 DB 읽기와 전송이 다른 방송의 채팅을 막지 않는다.
        subscribers.compute(broadcastId, (id, peers) -> {
            Set<ChatSubscriber> set = peers == null ? new CopyOnWriteArraySet<>() : peers;
            set.add(subscriber);
            return set;
        });
        Broadcast broadcast = broadcasts.findById(broadcastId).orElse(null);
        if (broadcast == null || !broadcast.isChat()) {
            release(broadcastId, subscriber);
            subscriber.close();
        } else if (!broadcast.acceptsCommentsNow() && release(broadcastId, subscriber)) {
            subscriber.send(ChatMessage.ended());
            subscriber.close();
        }
    }

    public void unsubscribe(ChatSubscriber subscriber) {
        subscribers.keySet().forEach(broadcastId -> release(broadcastId, subscriber));
    }

    /** 구독자를 표에서 뺀다. 이 호출이 뺐을 때만 true라서, 종료 알림을 보낼 책임이 한 곳에만 생긴다. */
    private boolean release(long broadcastId, ChatSubscriber subscriber) {
        boolean[] released = {false};
        subscribers.computeIfPresent(broadcastId, (id, peers) -> {
            released[0] = peers.remove(subscriber);
            return peers.isEmpty() ? null : peers;
        });
        return released[0];
    }

    /** 라이브방송이 끝났다. 송출 모듈이 종료 경로에서 부른다. 구독자 전원에게 ended를 보내고 닫는다. */
    public void endChat(long broadcastId) {
        Set<ChatSubscriber> peers = subscribers.remove(broadcastId);
        if (peers == null) {
            return;
        }
        for (ChatSubscriber subscriber : peers) {
            subscriber.send(ChatMessage.ended());
            subscriber.close();
        }
    }

    // 연결마다 전송이 직렬화되어 있으므로(WebSocketPeer) 여기서는 잠그지 않는다.
    private void publish(long broadcastId, CommentView view) {
        for (ChatSubscriber subscriber : subscribers.getOrDefault(broadcastId, Set.of())) {
            subscriber.send(ChatMessage.comment(view));
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
        long requester = Requester.id(userId);
        Broadcast broadcast = requireBroadcast(broadcastId);
        Comment comment = comments.findById(commentId)
                .filter(found -> found.broadcastId() == broadcastId)
                .orElseThrow(() -> new CommentNotFoundException(commentId));
        if (!broadcast.commentsDeletable()) {
            throw new ChatNotDeletableException(commentId);
        }
        if (!comment.isWrittenBy(requester)) {
            throw new CommentForbiddenException(commentId);
        }
        comments.delete(comment);
    }

    /** 방송을 지우기 전에 그 방송의 댓글을 모두 지운다. 부르는 쪽의 트랜잭션 안에서 실행된다. */
    @Transactional
    public void deleteAllOf(long broadcastId) {
        comments.deleteAllOf(broadcastId);
    }

    private Broadcast requireBroadcast(long broadcastId) {
        return broadcasts.findById(broadcastId).orElseThrow(() -> new BroadcastNotFoundException(broadcastId));
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
