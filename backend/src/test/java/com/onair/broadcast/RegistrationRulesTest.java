package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.util.unit.DataSize;

/** 등록 규칙을 Spring 없이 확인한다. 상한을 바꿔도 컨텍스트를 새로 띄우지 않는다. */
class RegistrationRulesTest {

    static final byte[] MP4_BYTES = {0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 1, 2, 3, 4};

    final RegistrationRules rules = new RegistrationRules(DataSize.ofKilobytes(2));

    static MockMultipartFile video(byte[] bytes) {
        return new MockMultipartFile("video", "v.mp4", "video/mp4", bytes);
    }

    @Test
    void 영상이_상한을_넘으면_상한_값을_담은_예외다() {
        byte[] tooBig = Arrays.copyOf(MP4_BYTES, 2 * 1024 + 1);

        assertThatThrownBy(() -> rules.validate(new RegistrationForm("제목", video(tooBig), null, null)))
                .isInstanceOfSatisfying(UploadTooLargeException.class,
                        e -> assertThat(e.maxBytes()).isEqualTo(2048));
    }

    @Test
    void 상한과_같은_크기의_영상은_통과한다() {
        byte[] exact = Arrays.copyOf(MP4_BYTES, 2 * 1024);

        RegisterRecordingCommand command = rules.validate(new RegistrationForm("제목", video(exact), null, null));

        assertThat(command.video().format()).isEqualTo(VideoFormat.MP4);
    }

    @Test
    void 요청_상한은_영상과_썸네일_상한에_여유를_더한_값이다() {
        assertThat(rules.maxRequestBytes()).isEqualTo(2048 + 2L * 1024 * 1024 + 1024 * 1024);
        assertThat(rules.policy()).isEqualTo(new UploadPolicy(2048, 2L * 1024 * 1024, 100));
    }

    @Test
    void 제목은_줄_바꿈_없는_공백까지_앞뒤에서_뗀다() {
        RegisterRecordingCommand command = rules.validate(
                new RegistrationForm("  \t제목　\n", video(MP4_BYTES), null, null));

        assertThat(command.title()).isEqualTo("제목");
    }

    @Test
    void 공백_문자만_있는_제목은_빈_제목이다() {
        assertThatThrownBy(() -> rules.validate(new RegistrationForm(" 　", video(MP4_BYTES), null, null)))
                .isInstanceOfSatisfying(InvalidRequestException.class,
                        e -> assertThat(e.violations()).extracting(FieldViolation::field).containsExactly("title"));
    }
}
