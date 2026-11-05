package com.onair.broadcast;

import java.util.List;

/** 요청 입력이 규칙에 맞지 않는다(등록 입력, 목록 size 등). 400으로 응답하고 필드별 오류를 담는다. */
class InvalidRequestException extends RuntimeException {

    private final List<FieldViolation> violations;

    InvalidRequestException(List<FieldViolation> violations) {
        super("입력값이 올바르지 않습니다");
        this.violations = List.copyOf(violations);
    }

    List<FieldViolation> violations() {
        return violations;
    }
}
