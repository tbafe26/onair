package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 방송(또는 썸네일)이 없다. ApiExceptionHandler가 404 ProblemDetail로 바꾼다. */
public class BroadcastNotFoundException extends ApiException {

    private static final long serialVersionUID = 1L;

    public BroadcastNotFoundException(long id) {
        super(HttpStatus.NOT_FOUND, "방송 없음", "방송을 찾을 수 없습니다: " + id);
    }
}
