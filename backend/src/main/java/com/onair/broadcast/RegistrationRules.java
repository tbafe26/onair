package com.onair.broadcast;

import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.api.UploadLimit;
import com.onair.api.UploadTooLargeException;
import com.onair.media.MultipartInputs;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.util.ArrayList;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.util.unit.DataSize;
import org.springframework.web.multipart.MultipartFile;

/**
 * 녹화방송 등록과 라이브방송 시작 규칙의 유일한 소유자: 영상·썸네일 크기 상한, 제목 길이, 멀티파트 요청 상한, 입력 검증.
 * 상한이 필요한 다른 곳(업로드 정책, 멀티파트 설정, 413 응답)은 여기서 값을 가져간다.
 */
@Component
public class RegistrationRules implements UploadLimit {

    static final int MAX_TITLE_LENGTH = 100;
    static final long MAX_THUMBNAIL_BYTES = DataSize.ofMegabytes(2).toBytes();
    // 요청 전체 상한에 더하는 여유. 멀티파트 경계와 텍스트 필드 몫이다.
    private static final long REQUEST_MARGIN_BYTES = DataSize.ofMegabytes(1).toBytes();

    private final long maxVideoBytes;

    RegistrationRules(@Value("${app.upload.max-size}") DataSize maxUploadSize) {
        this.maxVideoBytes = maxUploadSize.toBytes();
    }

    @Override
    public long maxVideoBytes() {
        return maxVideoBytes;
    }

    /** 요청 전체 상한: 영상 상한 + 썸네일 상한 + 여유. 상한 바로 아래 영상에 썸네일을 더해도 413이 되지 않는다. */
    long maxRequestBytes() {
        return maxVideoBytes + MAX_THUMBNAIL_BYTES + REQUEST_MARGIN_BYTES;
    }

    UploadPolicy policy() {
        return new UploadPolicy(maxVideoBytes, MAX_THUMBNAIL_BYTES, MAX_TITLE_LENGTH);
    }

    /** 입력을 검사한다. 틀린 필드를 모두 모아 InvalidRequestException으로, 영상 크기 초과는 UploadTooLargeException으로 던진다. */
    RegisterRecordingCommand validate(RegistrationForm form) {
        List<FieldViolation> violations = new ArrayList<>();

        String title = checkTitle(form.title(), violations);

        UploadedVideo uploaded = null;
        MultipartFile video = form.video();
        if (video == null || video.isEmpty()) {
            violations.add(new FieldViolation("video", "영상 파일을 선택하세요"));
        } else if (video.getSize() > maxVideoBytes) {
            throw new UploadTooLargeException(maxVideoBytes);
        } else {
            VideoFormat format = VideoFormat.detect(readHead(video, VideoFormat.SIGNATURE_LENGTH)).orElse(null);
            if (format == null) {
                violations.add(new FieldViolation("video", "mp4 또는 webm 영상 파일만 올릴 수 있습니다"));
            } else {
                uploaded = new UploadedVideo(video, format);
            }
        }

        MultipartFile thumbnail = checkThumbnail(form.thumbnail(), violations);

        DurationSeconds duration = null;
        String rawDuration = form.durationSeconds();
        if (rawDuration != null && !rawDuration.isBlank()) {
            duration = DurationSeconds.parse(rawDuration).orElse(null);
            if (duration == null) {
                violations.add(new FieldViolation("durationSeconds", "재생 시간은 0보다 큰 숫자여야 합니다"));
            }
        }

        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
        return new RegisterRecordingCommand(title, uploaded, thumbnail, duration);
    }

    /** 라이브방송 시작 입력을 검사한다. 제목과 썸네일 규칙은 녹화방송과 같고, 틀리면 InvalidRequestException이다. */
    public StartLiveCommand validate(StartLiveCommand command) {
        List<FieldViolation> violations = new ArrayList<>();
        String title = checkTitle(command.title(), violations);
        MultipartFile thumbnail = checkThumbnail(command.thumbnail(), violations);
        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
        return new StartLiveCommand(title, thumbnail);
    }

    /** 제목만 검사한다(제목 수정용). 규칙은 등록과 같고, 틀리면 InvalidRequestException이다. */
    String validateTitle(String rawTitle) {
        List<FieldViolation> violations = new ArrayList<>();
        String title = checkTitle(rawTitle, violations);
        if (!violations.isEmpty()) {
            throw new InvalidRequestException(violations);
        }
        return title;
    }

    private static String checkTitle(String rawTitle, List<FieldViolation> violations) {
        String title = trimWhiteSpace(rawTitle);
        if (title.isEmpty()) {
            violations.add(new FieldViolation("title", "제목을 입력하세요"));
        } else if (title.length() > MAX_TITLE_LENGTH) {
            violations.add(new FieldViolation("title", "제목은 " + MAX_TITLE_LENGTH + "자 이하로 입력하세요"));
        }
        return title;
    }

    /** 빈 파일은 보내지 않은 것으로 본다. 규칙에 맞는 썸네일을 돌려주고, 없거나 틀리면 null이다(틀리면 violations에 담는다). */
    private static MultipartFile checkThumbnail(MultipartFile thumbnail, List<FieldViolation> violations) {
        if (thumbnail == null || thumbnail.isEmpty()) {
            return null;
        }
        if (thumbnail.getSize() > MAX_THUMBNAIL_BYTES) {
            violations.add(new FieldViolation("thumbnail",
                    "썸네일은 " + UploadLimit.formatBytes(MAX_THUMBNAIL_BYTES) + " 이하여야 합니다"));
        } else if (!isJpeg(readHead(thumbnail, 3))) {
            violations.add(new FieldViolation("thumbnail", "썸네일은 JPEG 이미지여야 합니다"));
        }
        return thumbnail;
    }

    // 화면(upload-rules.ts)과 같은 기준으로 앞뒤 공백을 뗀다: 유니코드 White_Space 속성 문자(줄 바꿈 없는 공백 포함).
    // String.strip()은 줄 바꿈 없는 공백(U+00A0)을 남기고 JS trim()은 지워서 둘의 결과가 달랐다.
    // 정규식(\p{IsWhite_Space}+$)은 공백이 길게 이어진 입력에서 길이의 제곱만큼 느려져 앞뒤에서 한 번씩만 훑는다.
    static String trimWhiteSpace(String value) {
        if (value == null) {
            return "";
        }
        int start = 0;
        int end = value.length();
        while (start < end && isWhiteSpace(value.codePointAt(start))) {
            start += Character.charCount(value.codePointAt(start));
        }
        while (end > start && isWhiteSpace(value.codePointBefore(end))) {
            end -= Character.charCount(value.codePointBefore(end));
        }
        return value.substring(start, end);
    }

    // 유니코드 White_Space 속성: 공백 분류(Zs, Zl, Zp)와 제어 문자 U+0009~U+000D, U+0085
    private static boolean isWhiteSpace(int codePoint) {
        return Character.isSpaceChar(codePoint)
                || (codePoint >= 0x09 && codePoint <= 0x0D)
                || codePoint == 0x85;
    }

    private static boolean isJpeg(byte[] head) {
        return head.length >= 3 && head[0] == (byte) 0xFF && head[1] == (byte) 0xD8 && head[2] == (byte) 0xFF;
    }

    // 파일 전체가 아니라 앞부분만 읽는다.
    private static byte[] readHead(MultipartFile file, int length) {
        try (InputStream in = MultipartInputs.open(file)) {
            return in.readNBytes(length);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }
}
