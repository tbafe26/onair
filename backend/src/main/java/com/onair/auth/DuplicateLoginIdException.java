package com.onair.auth;

/** 이미 쓰는 아이디로 가입하려 했다. 409로 응답한다. */
public class DuplicateLoginIdException extends RuntimeException {

    private static final long serialVersionUID = 1L;

    public DuplicateLoginIdException() {
        super("이미 사용 중인 아이디입니다");
    }
}
