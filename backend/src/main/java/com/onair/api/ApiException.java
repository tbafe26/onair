package com.onair.api;

import org.springframework.http.HttpStatus;

/**
 * API 오류의 공통 부모. 상태 코드와 제목을 예외가 직접 지니고, 메시지가 ProblemDetail의 detail이 된다.
 * 응답으로 바꾸는 일은 ApiExceptionHandler가 한 곳에서 한다.
 */
public abstract class ApiException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    private final HttpStatus status;
    private final String title;

    protected ApiException(HttpStatus status, String title, String message) {
        super(message);
        this.status = status;
        this.title = title;
    }

    public HttpStatus status() {
        return status;
    }

    public String title() {
        return title;
    }
}