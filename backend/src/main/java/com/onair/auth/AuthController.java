package com.onair.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** 인증 REST adapter. 규칙은 Accounts가, 세션과 CSRF는 SecurityConfig가 맡는다. */
@RestController
@RequestMapping("/api/auth")
class AuthController {

    private final Accounts accounts;
    private final SecurityContextRepository contexts;
    private final ChangeSessionIdAuthenticationStrategy sessionIds = new ChangeSessionIdAuthenticationStrategy();
    private final SecurityContextLogoutHandler logoutHandler = new SecurityContextLogoutHandler();

    AuthController(Accounts accounts, SecurityContextRepository contexts) {
        this.accounts = accounts;
        this.contexts = contexts;
    }

    record SignupRequest(String loginId, String password, String nickname) {

        @Override
        public String toString() {
            return "SignupRequest[loginId=" + loginId + "]";
        }
    }

    record LoginRequest(String loginId, String password) {

        @Override
        public String toString() {
            return "LoginRequest[loginId=" + loginId + "]";
        }
    }

    @PostMapping("/signup")
    ResponseEntity<UserInfo> signup(
            @RequestBody SignupRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = accounts.signup(body.loginId(), body.password(), body.nickname());
        startSession(authentication, request, response);
        return ResponseEntity.status(HttpStatus.CREATED).body(((AuthenticatedUser) authentication.getPrincipal()).info());
    }

    @PostMapping("/login")
    UserInfo login(@RequestBody LoginRequest body, HttpServletRequest request, HttpServletResponse response) {
        Authentication authentication = accounts.login(body.loginId(), body.password());
        startSession(authentication, request, response);
        return ((AuthenticatedUser) authentication.getPrincipal()).info();
    }

    @PostMapping("/logout")
    ResponseEntity<Void> logout(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        logoutHandler.logout(request, response, authentication);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/me")
    UserInfo me(@AuthenticationPrincipal AuthenticatedUser user) {
        return user.info();
    }

    // 로그인하면 세션 id를 새로 발급해 세션 고정을 막고, 인증 정보를 세션에 저장한다.
    private void startSession(Authentication authentication, HttpServletRequest request, HttpServletResponse response) {
        sessionIds.onAuthentication(authentication, request, response);
        SecurityContext context = SecurityContextHolder.getContextHolderStrategy().createEmptyContext();
        context.setAuthentication(authentication);
        SecurityContextHolder.getContextHolderStrategy().setContext(context);
        contexts.saveContext(context, request, response);
    }
}
