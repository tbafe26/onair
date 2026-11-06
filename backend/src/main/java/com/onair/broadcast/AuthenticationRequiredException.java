package com.onair.broadcast;

/** 로그인하지 않은 요청이 로그인이 필요한 일을 하려 했다. 401로 이어진다. */
public class AuthenticationRequiredException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public AuthenticationRequiredException() {
        super("로그인이 필요합니다");
    }
}
