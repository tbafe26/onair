package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import java.io.IOException;
import java.nio.file.Files;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.ResultActions;

/** 방송 등록과 송출 시작은 로그인한 사용자만 할 수 있고, 그 사용자가 소유자가 된다. */
class BroadcastOwnerApiTest extends ApiTestSupport {

    ResultActions 등록한다(AuthClient client, String title) throws Exception {
        return mockMvc.perform(multipart("/api/broadcasts").with(client.credentials())
                .file(new MockMultipartFile("video", "v.mp4", "video/mp4", BroadcastPagingApiTest.MP4_BYTES))
                .param("title", title));
    }

    ResultActions 송출을_시작한다(AuthClient client, String title) throws Exception {
        return mockMvc.perform(multipart("/api/broadcasts/live").with(client.credentials()).param("title", title));
    }

    boolean 저장_폴더가_비어_있다() throws IOException {
        try (Stream<?> files = Files.list(storageDir)) {
            return files.findAny().isEmpty();
        }
    }

    @Test
    void 비로그인_등록은_401이고_아무것도_저장하지_않는다() throws Exception {
        AuthClient visitor = AuthClient.visitor(mockMvc);

        등록한다(visitor, "몰래 등록")
                .andExpect(status().isUnauthorized())
                .andExpect(jsonPath("$.status").value(401));

        assertThat(repository.count()).isZero();
        assertThat(저장_폴더가_비어_있다()).isTrue();
    }

    @Test
    void 비로그인_송출_시작은_401이고_저장하지_않는다() throws Exception {
        AuthClient visitor = AuthClient.visitor(mockMvc);

        송출을_시작한다(visitor, "몰래 송출").andExpect(status().isUnauthorized());

        assertThat(repository.count()).isZero();
    }

    @Test
    void 로그아웃한_세션의_등록도_401이다() throws Exception {
        AuthClient user = owner();
        user.logout();

        등록한다(user, "로그아웃 뒤").andExpect(status().isUnauthorized());
    }

    @Test
    void 등록한_사용자가_녹화방송의_소유자가_되어_목록과_상세에_보인다() throws Exception {
        long ownerId = owner().userId();
        String body = 등록한다(owner(), "내 녹화").andExpect(status().isCreated())
                .andExpect(jsonPath("$.owner.id").value(ownerId))
                .andExpect(jsonPath("$.owner.nickname").value("방장"))
                .andReturn().getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");

        mockMvc.perform(get("/api/broadcasts/" + id))
                .andExpect(jsonPath("$.owner.id").value(ownerId))
                .andExpect(jsonPath("$.owner.nickname").value("방장"));
        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(jsonPath("$.items[0].owner.id").value(ownerId))
                .andExpect(jsonPath("$.items[0].owner.nickname").value("방장"));
    }

    @Test
    void 송출을_시작한_사용자가_라이브방송의_소유자가_된다() throws Exception {
        long ownerId = owner().userId();
        String body = 송출을_시작한다(owner(), "내 라이브").andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");

        mockMvc.perform(get("/api/broadcasts/" + id))
                .andExpect(jsonPath("$.owner.id").value(ownerId))
                .andExpect(jsonPath("$.owner.nickname").value("방장"));
        mockMvc.perform(get("/api/broadcasts?kind=LIVE"))
                .andExpect(jsonPath("$.items[0].owner.id").value(ownerId));
    }

    @Test
    void 방송마다_자기를_등록한_사용자가_소유자다() throws Exception {
        AuthClient other = AuthClient.signedUp(mockMvc, "other01", "손님");
        등록한다(owner(), "방장의 방송").andExpect(status().isCreated());
        등록한다(other, "손님의 방송").andExpect(status().isCreated());

        mockMvc.perform(get("/api/broadcasts"))
                .andExpect(jsonPath("$.items[0].title").value("손님의 방송"))
                .andExpect(jsonPath("$.items[0].owner.nickname").value("손님"))
                .andExpect(jsonPath("$.items[1].owner.nickname").value("방장"));
    }
}
