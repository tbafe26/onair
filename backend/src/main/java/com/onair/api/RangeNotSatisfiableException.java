package com.onair.api;

/** 요청한 Range를 처리할 수 없다. 416으로 응답하고 Content-Range에 전체 크기를 싣는다. */
public class RangeNotSatisfiableException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final long resourceLength;

    public RangeNotSatisfiableException(long resourceLength) {
        super("처리할 수 없는 범위입니다");
        this.resourceLength = resourceLength;
    }

    long resourceLength() {
        return resourceLength;
    }
}
