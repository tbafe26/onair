package com.onair.broadcast;

import org.springframework.web.multipart.MultipartFile;

/**
 * 등록 요청에서 받은 그대로의 입력. 아직 검증 전이라 모두 없을 수 있고, 재생 시간은 문자열이다.
 * 숫자가 아닌 값도 필드 오류로 돌려주려고 문자열로 받는다.
 */
record RegistrationForm(
        String title,
        MultipartFile video,
        MultipartFile thumbnail,
        String durationSeconds) {
}
