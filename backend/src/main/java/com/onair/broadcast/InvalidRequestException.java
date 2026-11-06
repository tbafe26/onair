package com.onair.broadcast;

import com.onair.api.ApiException;
import java.util.List;
import org.springframework.http.HttpStatus;

/** 요청 입력이 규칙에 맞지 않는다(등록 입력, 목록 size 등). 400으로 응답하고 필드별 오류를 담는다. */
public class InvalidRequestException extends ApiException {

    private static final long serialVersionUID = 1L;

    // FieldViolation이 Serializable이 아니므로 직렬화에서 제외한다. 예외를 직렬화해 옮기는 곳은 없다.
    private final transient List<FieldViolation> violations;

    public InvalidRequestException(List<FieldViolation> violations) {
        super(HttpStatus.BAD_REQUEST, "잘못된 입력", "입력값이 올바르지 않습니다");
        this.violations = List.copyOf(violations);
    }

    public List<FieldViolation> violations() {
        return violations;
    }
}
