package com.onair.broadcast;

import com.onair.api.ApiException;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.TypeMismatchException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

/** 모든 API 오류를 ProblemDetail(RFC 9457)로 바꾼다. 상태 코드: 400, 401, 403, 404, 409, 413, 416, 500. */
@RestControllerAdvice
class ApiExceptionHandler extends ResponseEntityExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    private final RegistrationRules rules;

    ApiExceptionHandler(RegistrationRules rules) {
        this.rules = rules;
    }

    @ExceptionHandler(InvalidRequestException.class)
    ResponseEntity<Object> handleInvalid(InvalidRequestException e, WebRequest request) {
        ProblemDetail problem = problem(e.status(), e.title(), e.getMessage());
        List<Map<String, String>> errors = e.violations().stream()
                .map(v -> Map.of("field", v.field(), "reason", v.reason()))
                .toList();
        problem.setProperty("errors", errors);
        return respond(e, problem, new HttpHeaders(), request);
    }

    // 상태 코드와 제목은 예외가 지닌다.
    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> handleApi(ApiException e, WebRequest request) {
        return respond(e, problem(e.status(), e.title(), e.getMessage()), new HttpHeaders(), request);
    }

    // 숫자가 아닌 방송 id(/api/broadcasts/abc)는 없는 방송과 같은 404다. 다른 인자의 타입 오류는 기본 처리(400)를 따른다.
    @Override
    protected ResponseEntity<Object> handleTypeMismatch(
            TypeMismatchException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        if (e instanceof MethodArgumentTypeMismatchException mismatch && "id".equals(mismatch.getName())) {
            return respond(e, problem(HttpStatus.NOT_FOUND, "방송 없음",
                    "방송을 찾을 수 없습니다: " + mismatch.getValue()), new HttpHeaders(), request);
        }
        return super.handleTypeMismatch(e, headers, status, request);
    }

    @ExceptionHandler(UploadTooLargeException.class)
    ResponseEntity<Object> handleTooLarge(UploadTooLargeException e, WebRequest request) {
        return tooLarge(e, e.maxBytes(), request);
    }

    // 멀티파트 파서가 상한을 넘긴 요청을 컨트롤러 전에 거절하는 경우도 같은 413 본문이다.
    @Override
    protected ResponseEntity<Object> handleMaxUploadSizeExceededException(
            MaxUploadSizeExceededException e, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        return tooLarge(e, rules.maxVideoBytes(), request);
    }

    private ResponseEntity<Object> tooLarge(Exception e, long maxBytes, WebRequest request) {
        ProblemDetail problem = problem(HttpStatus.CONTENT_TOO_LARGE, "업로드 크기 초과",
                "영상은 " + RegistrationRules.formatBytes(maxBytes) + " 이하만 올릴 수 있습니다");
        problem.setProperty("maxBytes", maxBytes);
        return respond(e, problem, new HttpHeaders(), request);
    }

    @ExceptionHandler(RangeNotSatisfiableException.class)
    ResponseEntity<Object> handleRange(RangeNotSatisfiableException e, WebRequest request) {
        ProblemDetail problem = problem(HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE, "범위 오류", e.getMessage());
        HttpHeaders headers = new HttpHeaders();
        headers.set(HttpHeaders.CONTENT_RANGE, "bytes */" + e.resourceLength());
        return respond(e, problem, headers, request);
    }

    // 예상하지 못한 오류. 내부 메시지는 응답에 싣지 않고 로그에만 남긴다.
    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> handleUnexpected(Exception e, WebRequest request) throws Exception {
        log.error("처리하지 못한 오류", e);
        ProblemDetail problem = problem(HttpStatus.INTERNAL_SERVER_ERROR, "서버 오류", "서버에서 오류가 발생했습니다");
        return respond(e, problem, new HttpHeaders(), request);
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }

    // 상태 코드는 ProblemDetail의 것을 그대로 쓴다.
    private ResponseEntity<Object> respond(
            Exception e, ProblemDetail problem, HttpHeaders headers, WebRequest request) {
        return handleExceptionInternal(e, problem, headers, HttpStatusCode.valueOf(problem.getStatus()), request);
    }

    // 영상 요청의 Accept가 영상 형식이어도 오류 본문은 항상 problem+json이다.
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(
            Exception e, Object body, HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        HttpHeaders withType = new HttpHeaders();
        withType.putAll(headers);
        withType.setContentType(MediaType.APPLICATION_PROBLEM_JSON);
        return super.handleExceptionInternal(e, body, withType, status, request);
    }
}
