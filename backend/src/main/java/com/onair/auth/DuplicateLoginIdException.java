package com.onair.auth;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 이미 쓰는 아이디로 가입하려 했다. 409로 응답한다. */
public class DuplicateLoginIdException extends ApiException {

    private static final long serialVersionUID = 1L;

    public DuplicateLoginIdException() {
        super(HttpStatus.CONFLICT, "아이디 중복", "이미 사용 중인 아이디입니다");
    }
}
