package com.onair.api;

/** 입력 오류 하나: 어떤 필드가 왜 틀렸는지. 400 응답의 errors 목록에 담긴다. */
public record FieldViolation(String field, String reason) {
}
