package com.onair.broadcast;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** DB에는 기존처럼 미디어 타입 문자열(video/mp4)로 저장해 이미 만든 로컬 DB와 호환된다. */
@Converter
class VideoFormatConverter implements AttributeConverter<VideoFormat, String> {

    @Override
    public String convertToDatabaseColumn(VideoFormat format) {
        return format == null ? null : format.mediaType();
    }

    @Override
    public VideoFormat convertToEntityAttribute(String mediaType) {
        return mediaType == null ? null : VideoFormat.fromMediaType(mediaType);
    }
}
