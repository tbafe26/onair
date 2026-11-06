package com.onair.api;

import org.springframework.util.unit.DataSize;

/** 영상·썸네일 업로드 크기 상한. 값은 방송 등록 규칙이 정하고, 413 응답이 이 접점으로 상한을 가져간다. */
public interface UploadLimit {

    long maxVideoBytes();

    long maxThumbnailBytes();

    /** 바이트 수를 "2MB", "512KB" 같은 문구로 바꾼다. 딱 떨어지지 않으면 바이트로 쓴다. */
    static String formatBytes(long bytes) {
        long mb = DataSize.ofMegabytes(1).toBytes();
        long kb = DataSize.ofKilobytes(1).toBytes();
        if (bytes % mb == 0) {
            return bytes / mb + "MB";
        }
        if (bytes % kb == 0) {
            return bytes / kb + "KB";
        }
        return bytes + "바이트";
    }
}
