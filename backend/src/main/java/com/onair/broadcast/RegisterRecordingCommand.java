package com.onair.broadcast;

import org.springframework.web.multipart.MultipartFile;

/**
 * 검증을 마친 녹화방송 등록 명령. thumbnail과 duration은 없을 수 있어 null이다(썸네일은 보낸 경우에만 값이 있다).
 */
record RegisterRecordingCommand(
        String title,
        UploadedVideo video,
        MultipartFile thumbnail,
        DurationSeconds duration) {
}
