package com.onair.broadcast;

import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 댓글 모듈. 댓글의 규칙(길이, 작성자, 방송별 범위)을 한 곳에 둔다. REST adapter가 이 모듈을 부른다.
 * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
 */
@Service
class Comments {

    private final CommentRepository comments;
    private final BroadcastRepository broadcasts;
    private final AppUserRepository users;
    private final Clock clock;

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
        String content = validate(rawContent);
        return CommentView.of(comments.save(new Comment(broadcast, author, content, Instant.now(clock))));
    }

    /** 댓글을 지운다. 로그인(401), 방송과 댓글 존재(404, 다른 방송의 댓글 포함), 작성자(403) 순으로 확인한다. */
    @Transactional
    void delete(long broadcastId, long commentId, Long userId) {
        long requester = requireUserId(userId);
        requireBroadcast(broadcastId);
        Comment comment = comments.findById(commentId)
                .filter(found -> found.broadcastId() == broadcastId)
                .orElseThrow(() -> new CommentNotFoundException(commentId));
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
