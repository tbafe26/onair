package com.onair.auth;

import java.util.Collection;
import java.util.List;
import org.springframework.security.core.CredentialsContainer;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

/** 세션에 담기는 로그인한 사용자. 인증이 끝나면 비밀번호 해시는 지워진다. */
public final class AuthenticatedUser implements UserDetails, CredentialsContainer {

    private static final long serialVersionUID = 1L;

    private final long id;
    private final String loginId;
    private final String nickname;
    private String passwordHash;

    AuthenticatedUser(AppUser user) {
        this.id = user.getId();
        this.loginId = user.getLoginId();
        this.nickname = user.getNickname();
        this.passwordHash = user.getPasswordHash();
    }

    public long id() {
        return id;
    }

    /** 컨트롤러가 요청한 사용자의 id를 모듈에 넘길 때 쓴다. 로그인하지 않았으면 null이다. */
    public static Long idOf(AuthenticatedUser user) {
        return user == null ? null : user.id;
    }

    public UserInfo info() {
        return new UserInfo(id, loginId, nickname);
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        return List.of();
    }

    @Override
    public String getPassword() {
        return passwordHash;
    }

    @Override
    public String getUsername() {
        return loginId;
    }

    @Override
    public void eraseCredentials() {
        passwordHash = null;
    }

    @Override
    public String toString() {
        return "AuthenticatedUser[id=" + id + "]";
    }
}
