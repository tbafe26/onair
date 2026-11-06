package com.onair.broadcast;

/** 방송(또는 썸네일)이 없다. ApiExceptionHandler가 404 ProblemDetail로 바꾼다. */
class BroadcastNotFoundException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    BroadcastNotFoundException(long id) {
        super("방송을 찾을 수 없습니다: " + id);
    }
}
