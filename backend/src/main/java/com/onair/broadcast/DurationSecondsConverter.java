package com.onair.broadcast;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** DB에는 기존처럼 double 숫자 하나로 저장한다. 값이 없으면 null이다. */
@Converter
class DurationSecondsConverter implements AttributeConverter<DurationSeconds, Double> {

    @Override
    public Double convertToDatabaseColumn(DurationSeconds duration) {
        return duration == null ? null : duration.value();
    }

    @Override
    public DurationSeconds convertToEntityAttribute(Double seconds) {
        return seconds == null ? null : new DurationSeconds(seconds);
    }
}
