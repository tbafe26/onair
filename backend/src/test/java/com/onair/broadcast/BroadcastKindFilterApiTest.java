package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;

/** 목록의 종류 필터: GET /api/broadcasts?kind=LIVE|RECORDING. */
class BroadcastKindFilterApiTest extends ApiTestSupport {

    int 녹화방송을_등록한다(String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts")
                        .file(new MockMultipartFile(
                                "video", "v.mp4", "video/mp4", BroadcastPagingApiTest.MP4_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    List<Integer> 목록_ids(String query) throws Exception {
        String body = mockMvc.perform(get("/api/broadcasts" + query))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.items[*].id");
    }

    @Test
    void kind가_RECORDING이면_녹화방송을_최신순으로_돌려준다() throws Exception {
        int first = 녹화방송을_등록한다("첫 방송");
        int second = 녹화방송을_등록한다("둘째 방송");

        assertThat(목록_ids("?kind=RECORDING")).containsExactly(second, first);
    }

    @Test
    void kind가_RECORDING이어도_커서와_크기_규칙은_같다() throws Exception {
        int first = 녹화방송을_등록한다("첫 방송");
        int second = 녹화방송을_등록한다("둘째 방송");
        int third = 녹화방송을_등록한다("셋째 방송");

        assertThat(목록_ids("?kind=RECORDING&size=2")).containsExactly(third, second);
        assertThat(목록_ids("?kind=RECORDING&before=" + second + "&size=2")).containsExactly(first);
        mockMvc.perform(get("/api/broadcasts?kind=RECORDING&size=0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("size"));
    }

    @Test
    void kind가_LIVE이면_라이브방송이_아직_없으므로_빈_목록이다() throws Exception {
        녹화방송을_등록한다("녹화방송");

        mockMvc.perform(get("/api/broadcasts?kind=LIVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.hasNext").value(false));
    }

    @Test
    void kind가_없으면_종류와_상관없이_전부_돌려준다() throws Exception {
        int first = 녹화방송을_등록한다("첫 방송");
        int second = 녹화방송을_등록한다("둘째 방송");

        assertThat(목록_ids("")).containsExactly(second, first);
    }

    @Test
    void 알_수_없는_kind는_kind_필드_오류의_400이다() throws Exception {
        for (String bad : new String[] {"?kind=VOD", "?kind=recording", "?kind="}) {
            mockMvc.perform(get("/api/broadcasts" + bad))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.errors[0].field").value("kind"));
        }
    }
}
