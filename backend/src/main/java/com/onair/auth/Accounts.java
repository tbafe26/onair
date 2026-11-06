package com.onair.auth;

import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import java.time.Clock;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** 가입과 로그인의 규칙. 규칙 위반은 400, 중복 아이디는 409, 로그인 실패는 401로 이어지는 예외를 던진다. */
@Service
class Accounts {

    private static final Pattern LOGIN_ID = Pattern.compile("[a-z0-9]{4,20}");

    private final AppUserRepository users;
    private final PasswordEncoder encoder;
    private final AuthenticationManager authentication;
    private final Clock clock;

    Accounts(AppUserRepository users, PasswordEncoder encoder, AuthenticationManager authentication, Clock clock) {
        this.users = users;
        this.encoder = encoder;
        this.authentication = authentication;
        this.clock = clock;
    }

    /** 가입한 사용자를 로그인된 인증 정보로 돌려준다. */
    Authentication signup(String loginId, String password, String nickname) {
        String trimmedNickname = nickname == null ? null : nickname.strip();
        validate(loginId, password, trimmedNickname);
        if (users.existsByLoginId(loginId)) {
            throw new DuplicateLoginIdException();
        }
        AppUser saved;
        try {
            saved = users.saveAndFlush(new AppUser(loginId, encoder.encode(password), trimmedNickname, Instant.now(clock)));
        } catch (DataIntegrityViolationException e) {
            // 같은 아이디가 동시에 가입한 경우. 유일 제약이 막는다.
            throw new DuplicateLoginIdException();
        }
        AuthenticatedUser principal = new AuthenticatedUser(saved);
        principal.eraseCredentials();
        return UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
    }

    Authentication login(String loginId, String password) {
        try {
            return authentication.authenticate(
                    UsernamePasswordAuthenticationToken.unauthenticated(loginId == null ? "" : loginId, password == null ? "" : password));
        } catch (AuthenticationException e) {
            throw new InvalidCredentialsException();
        }
    }

    private static void validate(String loginId, String password, String nickname) {
        List<FieldViolation> violations = new ArrayList<>();
        if (loginId == null || !LOGIN_ID.matcher(loginId).matches()) {
            violations.add(new FieldViolation("loginId", "아이디는 영문 소문자와 숫자 4~20자로 입력하세요"));
        }
        if (password == null || password.length() < 8 || password.length() > 64) {
            violations.add(new FieldViolation("password", "비밀번호는 8~64자로 입력하세요"));
        }
        if (nickname == null || nickname.isEmpty() || nickname.codePointCount(0, nickname.length()) > 20) {
            violations.add(new FieldViolation("nickname", "닉네임은 1~20자로 입력하세요"));
        }
        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
    }
}
