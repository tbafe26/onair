package com.onair.auth;

/** 내 정보 응답. 비밀번호 원문과 해시는 담지 않는다. */
public record UserInfo(long id, String loginId, String nickname) {
}
