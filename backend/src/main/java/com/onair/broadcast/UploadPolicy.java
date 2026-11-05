package com.onair.broadcast;

/** 업로드 정책. 화면이 서버와 같은 상한으로 미리 검사하도록 알려 준다. */
record UploadPolicy(long maxVideoBytes, long maxThumbnailBytes, int maxTitleLength) {
}
