package com.onair.broadcast;

/** 댓글이 없거나 다른 방송의 댓글이다. 404로 이어진다. */
class CommentNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    CommentNotFoundException(long id) {
        super("댓글을 찾을 수 없습니다: " + id);
    }
}
