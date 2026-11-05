package com.onair.broadcast;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import org.springframework.web.multipart.MultipartFile;

/** 업로드 파일의 스트림을 여는 공용 도우미. IOException을 UncheckedIOException으로 바꾼다. */
final class MultipartInputs {

    private MultipartInputs() {
    }

    /** 호출자가 닫는다(try-with-resources). */
    static InputStream open(MultipartFile file) {
        try {
            return file.getInputStream();
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
