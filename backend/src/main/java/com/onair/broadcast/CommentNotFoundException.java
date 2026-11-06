package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 댓글이 없거나 다른 방송의 댓글이다. 404로 이어진다. */
class CommentNotFoundException extends ApiException {

    private static final long serialVersionUID = 1L;

    CommentNotFoundException(long id) {
        super(HttpStatus.NOT_FOUND, "댓글 없음", "댓글을 찾을 수 없습니다: " + id);
    }
}
