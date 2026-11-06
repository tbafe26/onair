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

    /** 업로드 파일을 묶음에 저장하고 서버가 만든 키를 돌려준다. */
    static String store(MediaStorage.Batch batch, MultipartFile file) {
        try (InputStream in = open(file)) {
            return batch.store(in);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
