package com.onair.broadcast;

import org.springframework.web.multipart.MultipartFile;

/** 검증을 마친 업로드 영상. 파일과, 내용에서 확인한 형식은 항상 함께 다닌다. */
record UploadedVideo(MultipartFile file, VideoFormat format) {
}
