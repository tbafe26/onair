package com.onair.broadcast;

import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;

/**
 * 요청한 사용자 확인. 모듈은 로그인하지 않은 요청을 null인 userId로 받고, 로그인이 필요한 곳에서 여기로 거른다(401).
 */
final class Requester {

    private Requester() {
    }

    /** 로그인한 사용자의 id. 로그인하지 않았으면 401 예외다. */
    static long id(Long userId) {
        if (userId == null) {
            throw new AuthenticationRequiredException();
        }
        return userId;
    }

    /** 로그인한 사용자. 로그인하지 않았거나 세션의 사용자가 이미 사라졌으면 401 예외다. */
    static AppUser load(Long userId, AppUserRepository users) {
        return users.findById(id(userId)).orElseThrow(AuthenticationRequiredException::new);
    }
}
