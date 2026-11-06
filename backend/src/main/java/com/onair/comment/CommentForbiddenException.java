package com.onair.comment;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 작성자가 아닌 사용자가 댓글을 지우려 했다(방송 소유자도 마찬가지). 403으로 이어진다. */
class CommentForbiddenException extends ApiException {

    private static final long serialVersionUID = 1L;

    CommentForbiddenException(long id) {
        super(HttpStatus.FORBIDDEN, "권한 없음", "댓글은 작성자만 지울 수 있습니다: " + id);
    }
}
