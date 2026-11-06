package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 방송은 있지만 썸네일이 없다. ApiExceptionHandler가 404 ProblemDetail로 바꾼다. */
class ThumbnailNotFoundException extends ApiException {

    private static final long serialVersionUID = 1L;

    ThumbnailNotFoundException() {
        super(HttpStatus.NOT_FOUND, "썸네일 없음", "이 방송에는 썸네일이 없습니다");
    }
}
