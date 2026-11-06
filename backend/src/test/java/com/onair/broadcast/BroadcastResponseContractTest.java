package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** 방송 응답 JSON의 필드 이름이 공유 계약 파일(contracts/broadcast-responses.json)과 같은지 확인한다. */
class BroadcastResponseContractTest extends ApiTestSupport {

    // Gradle은 backend/를 작업 디렉터리로 테스트를 돌린다.
    static final Path CONTRACT = Path.of("..", "contracts", "broadcast-responses.json");

    final JsonMapper mapper = JsonMapper.builder().build();
    final JsonNode contract = mapper.readTree(CONTRACT.toFile());

    JsonNode 읽는다(String url) throws Exception {
        return mapper.readTree(mockMvc.perform(get(url))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString());
    }

    long 녹화방송을_등록한다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile(
                                "video", "v.mp4", "video/mp4", BroadcastPagingApiTest.MP4_BYTES))
                        .param("title", "녹화"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asLong();
    }

    long 라이브방송을_시작한다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "라이브"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return mapper.readTree(body).get("id").asLong();
    }

    List<String> 이름들(JsonNode array) {
        List<String> names = new ArrayList<>();
        array.forEach(n -> names.add(n.asString()));
        return names;
    }

    /** 필수 필드는 값이 있고, null 가능 필드는 키가 있으며(서버는 null도 직렬화한다), 그 밖의 필드는 없어야 한다. */
    void 계약과_같다(JsonNode actual, JsonNode shape) {
        List<String> required = 이름들(shape.get("required"));
        List<String> nullable = 이름들(shape.get("nullable"));

        Set<String> expectedKeys = new TreeSet<>(required);
        expectedKeys.addAll(nullable);
        assertThat(new TreeSet<>(actual.propertyNames())).isEqualTo(expectedKeys);
        for (String name : required) {
            assertThat(actual.get(name).isNull()).as(name + "은 null이 아니어야 한다").isFalse();
        }
    }

    @Test
    void 녹화방송의_목록_항목과_상세는_계약과_같다() throws Exception {
        long id = 녹화방송을_등록한다();
        JsonNode recording = contract.get("RECORDING");

        JsonNode item = 읽는다("/api/broadcasts?kind=RECORDING").get("items").get(0);
        계약과_같다(item, recording.get("summary"));
        계약과_같다(item.get("owner"), contract.get("owner"));

        JsonNode detail = 읽는다("/api/broadcasts/" + id);
        계약과_같다(detail, recording.get("detail"));
        계약과_같다(detail.get("video"), recording.get("detail").get("video"));
        계약과_같다(detail.get("owner"), contract.get("owner"));
    }

    @Test
    void 라이브방송의_목록_항목과_상세는_계약과_같다() throws Exception {
        long id = 라이브방송을_시작한다();
        JsonNode live = contract.get("LIVE");

        JsonNode item = 읽는다("/api/broadcasts?kind=LIVE").get("items").get(0);
        계약과_같다(item, live.get("summary"));
        계약과_같다(item.get("owner"), contract.get("owner"));

        JsonNode detail = 읽는다("/api/broadcasts/" + id);
        계약과_같다(detail, live.get("detail"));
        계약과_같다(detail.get("owner"), contract.get("owner"));
    }
}
