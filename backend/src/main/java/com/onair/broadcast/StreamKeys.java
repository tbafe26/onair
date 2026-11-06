package com.onair.broadcast;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** 송출 키 발급과 확인. 원문은 응답으로 한 번만 나가고, 저장소에는 SHA-256 해시만 둔다. */
public final class StreamKeys {

    private static final int KEY_BYTES = 32;
    private static final SecureRandom RANDOM = new SecureRandom();

    private StreamKeys() {
    }

    public static String generate() {
        byte[] bytes = new byte[KEY_BYTES];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public static String hash(String streamKey) {
        return HexFormat.of().formatHex(digest(streamKey));
    }

    /** 키가 해시와 맞는지 본다. 어디서 달라졌는지 시간 차로 드러나지 않도록 고정 길이 비교를 쓴다. */
    static boolean matches(String streamKey, String expectedHash) {
        if (streamKey == null) {
            return false;
        }
        return MessageDigest.isEqual(
                digest(streamKey), HexFormat.of().parseHex(expectedHash));
    }

    private static byte[] digest(String value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256을 쓸 수 없습니다", e);
        }
    }
}
