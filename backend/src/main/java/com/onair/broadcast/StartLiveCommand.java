package com.onair.broadcast;

import org.springframework.web.multipart.MultipartFile;

/** 라이브방송 시작 요청. 검증은 start가 한다. thumbnail은 없을 수 있어 null이다. */
public record StartLiveCommand(String title, MultipartFile thumbnail) {
}
