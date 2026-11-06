package com.onair.auth;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 로그인 실패. 아이디와 비밀번호 중 어느 쪽이 틀렸는지 드러내지 않는다. 401로 응답한다. */
public class InvalidCredentialsException extends ApiException {

    private static final long serialVersionUID = 1L;

    public InvalidCredentialsException() {
        super(HttpStatus.UNAUTHORIZED, "로그인 실패", "아이디 또는 비밀번호가 올바르지 않습니다");
    }
}
