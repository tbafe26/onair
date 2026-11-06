package com.onair.broadcast;

import java.util.List;
import java.util.function.Function;
import org.springframework.data.domain.PageRequest;

/**
 * 커서 방식 목록의 공통 규칙. size가 null이면 기본값이고, 한도를 넘으면 한도로 줄이며, 1 미만이면 400 예외다.
 * 방송 목록과 댓글 목록이 같은 규칙을 쓴다.
 */
final class CursorPaging {

    static final int DEFAULT_SIZE = 20;
    static final int MAX_SIZE = 50;

    private CursorPaging() {
    }

    /** 읽어 온 한 묶음. hasNext는 이 뒤에 더 있는지다. */
    record Slice<T>(List<T> items, boolean hasNext) {
    }

    /** before가 null이면 가장 최신부터 읽는다는 뜻으로, 어떤 id보다도 큰 값을 돌려준다. */
    static long cursor(Long before) {
        return before == null ? Long.MAX_VALUE : before;
    }

    /** 한 건 더 읽어 다음 묶음이 있는지 판단하고, 요청한 크기만큼만 돌려준다. */
    static <T> Slice<T> read(Integer requestedSize, Function<PageRequest, List<T>> finder) {
        int size = requestedSize == null ? DEFAULT_SIZE : requestedSize;
        if (size < 1) {
            throw new InvalidRequestException(List.of(new FieldViolation("size", "size는 1 이상이어야 합니다")));
        }
        size = Math.min(size, MAX_SIZE);
        List<T> found = finder.apply(PageRequest.of(0, size + 1));
        return new Slice<>(found.stream().limit(size).toList(), found.size() > size);
    }
}
