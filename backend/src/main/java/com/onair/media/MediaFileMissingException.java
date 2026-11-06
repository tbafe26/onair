package com.onair.media;

import com.onair.api.ApiException;
import org.springframework.http.HttpStatus;

/** 방송은 있지만 저장소에서 파일(영상 또는 썸네일)이 사라졌다. 404로 응답한다. */
public class MediaFileMissingException extends ApiException {

    private static final long serialVersionUID = 1L;

    public MediaFileMissingException() {
        super(HttpStatus.NOT_FOUND, "파일 없음", "저장된 파일을 찾을 수 없습니다");
    }
}
