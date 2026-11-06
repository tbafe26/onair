package com.onair.broadcast;

/** 작성자가 아닌 사용자가 댓글을 지우려 했다(방송 소유자도 마찬가지). 403으로 이어진다. */
class CommentForbiddenException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    CommentForbiddenException(long id) {
        super("댓글은 작성자만 지울 수 있습니다: " + id);
    }
}
