package com.onair.broadcast;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 로그인하지 않은 요청이 로그인이 필요한 일을 하려 했다. 401로 이어진다. */
public class AuthenticationRequiredException extends ApiException {

    private static final long serialVersionUID = 1L;

    public AuthenticationRequiredException() {
        super(HttpStatus.UNAUTHORIZED, "로그인 필요", "로그인이 필요합니다");
    }
}
