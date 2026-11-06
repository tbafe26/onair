package com.onair.auth;

/** 로그인 실패. 아이디와 비밀번호 중 어느 쪽이 틀렸는지 드러내지 않는다. 401로 응답한다. */
public class InvalidCredentialsException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public InvalidCredentialsException() {
        super("아이디 또는 비밀번호가 올바르지 않습니다");
    }
}
