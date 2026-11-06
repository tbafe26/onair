package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.reflect.Modifier;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.List;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 시그널링 문자열이 공유 계약 파일(contracts/signaling.json)과 같은지 Spring 없이 확인한다. */
class SignalingContractTest {

    // Gradle은 backend/를 작업 디렉터리로 테스트를 돌린다.
    static final Path CONTRACT = Path.of("..", "contracts", "signaling.json");

    final JsonNode contract = JsonMapper.builder().build().readTree(CONTRACT.toFile());

    @Test
    void SignalMessage의_메시지_종류는_계약의_메시지_종류와_같다() {
        List<String> declared = Arrays.stream(SignalMessage.class.getDeclaredFields())
                .filter(f -> Modifier.isPublic(f.getModifiers()) && Modifier.isStatic(f.getModifiers()))
                .filter(f -> f.getType() == String.class)
                .map(f -> {
                    try {
                        return (String) f.get(null);
                    } catch (IllegalAccessException e) {
                        throw new IllegalStateException(e);
                    }
                })
                .toList();

        assertThat(declared).containsExactlyInAnyOrderElementsOf(contract.get("messages").propertyNames());
    }

    @Test
    void 거절_사유는_계약의_거절_사유와_같다() {
        List<String> reasons = Arrays.stream(JoinResult.Rejection.values())
                .map(JoinResult.Rejection::reason)
                .toList();
        List<String> contracted = StreamSupport.stream(contract.get("rejectionReasons").spliterator(), false)
                .map(JsonNode::asString)
                .toList();

        assertThat(reasons).containsExactlyInAnyOrderElementsOf(contracted);
    }
}
