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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

/** 라이브방송의 REST 면: 시작, 목록·상세 모양, 송출 키 미노출, 영상 요청 404. */
class LiveBroadcastApiTest extends ApiTestSupport {

    static final byte[] JPEG_BYTES = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 16};

    @Autowired
    LiveBroadcasting live;

    ResultActions 시작을_요청한다(String title) throws Exception {
        return mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", title));
    }

    record Started(int id, String streamKey) {
    }

    Started 시작한다(String title) throws Exception {
        String body = 시작을_요청한다(title)
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return new Started(JsonPath.read(body, "$.id"), JsonPath.read(body, "$.streamKey"));
    }

    @Test
    void 제목만_보내면_201과_id_송출_키_Location을_돌려준다() throws Exception {
        MvcResult result = 시작을_요청한다("첫 라이브")
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.id").isNumber())
                .andExpect(jsonPath("$.streamKey").isString())
                .andReturn();
        String body = result.getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");

        assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/broadcasts/" + id);
        assertThat((String) JsonPath.read(body, "$.streamKey")).hasSizeGreaterThanOrEqualTo(40);
    }

    @Test
    void 제목이_틀리면_1단계와_같은_형식의_400이다() throws Exception {
        시작을_요청한다("   ")
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                .andExpect(jsonPath("$.errors[0].field").value("title"))
                .andExpect(jsonPath("$.errors[0].reason").value("제목을 입력하세요"));
        시작을_요청한다("가".repeat(101))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("title"));
        assertThat(repository.count()).isZero();
    }

    @Test
    void JPEG가_아닌_썸네일은_thumbnail_필드_오류다() throws Exception {
        mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials())
                        .file(new MockMultipartFile("thumbnail", "t.png", "image/png", new byte[] {1, 2, 3, 4}))
                        .param("title", "썸네일"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.errors[0].field").value("thumbnail"));
    }

    @Test
    void 내용이_JPEG가_아니거나_2MB를_넘는_썸네일은_400이고_방송이_만들어지지_않는다() throws Exception {
        byte[] big = new byte[2 * 1024 * 1024 + 1];
        System.arraycopy(JPEG_BYTES, 0, big, 0, JPEG_BYTES.length);
        for (byte[] bad : new byte[][] {"not a jpeg".getBytes(), big}) {
            mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials())
                            .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", bad))
                            .param("title", "썸네일"))
                    .andExpect(status().isBadRequest())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
                    .andExpect(jsonPath("$.errors[0].field").value("thumbnail"));
        }
        assertThat(repository.count()).isZero();
    }

    @Test
    void 썸네일을_보내면_요약과_상세에_썸네일_주소가_있고_내려받을_수_있다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials())
                        .file(new MockMultipartFile("thumbnail", "t.jpg", "image/jpeg", JPEG_BYTES))
                        .param("title", "썸네일 있음"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");

        mockMvc.perform(get("/api/broadcasts/" + id))
                .andExpect(jsonPath("$.thumbnailUrl").value("/api/broadcasts/" + id + "/thumbnail"));
        mockMvc.perform(get("/api/broadcasts/" + id + "/thumbnail"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(JPEG_BYTES));
    }

    @Test
    void 라이브_요약은_정해진_필드만_갖고_재생_시간과_송출_키가_없다() throws Exception {
        Started started = 시작한다("요약 확인");

        String body = mockMvc.perform(get("/api/broadcasts?kind=LIVE"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(started.id()))
                .andExpect(jsonPath("$.items[0].kind").value("LIVE"))
                .andExpect(jsonPath("$.items[0].title").value("요약 확인"))
                .andExpect(jsonPath("$.items[0].thumbnailUrl").value((Object) null))
                .andExpect(jsonPath("$.items[0].createdAt").isString())
                .andExpect(jsonPath("$.items[0].status").value("ON_AIR"))
                .andExpect(jsonPath("$.items[0].durationSeconds").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(started.streamKey()).doesNotContainIgnoringCase("streamKey");
    }

    @Test
    void 라이브_상세는_종료_시각을_더하고_송출_키를_담지_않는다() throws Exception {
        Started started = 시작한다("상세 확인");

        String body = mockMvc.perform(get("/api/broadcasts/" + started.id()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.kind").value("LIVE"))
                .andExpect(jsonPath("$.status").value("ON_AIR"))
                .andExpect(jsonPath("$.endedAt").value((Object) null))
                .andExpect(jsonPath("$.video").doesNotExist())
                .andReturn().getResponse().getContentAsString();

        assertThat(body).doesNotContain(started.streamKey()).doesNotContainIgnoringCase("streamKey");
        assertThat(body).doesNotContainIgnoringCase("hash");
    }

    @Test
    void 종료된_방송은_상태와_종료_시각이_조회에_반영된다() throws Exception {
        Started started = 시작한다("종료 반영");
        RecordingPeer broadcaster = new RecordingPeer();
        live.joinAsBroadcaster(started.id(), started.streamKey(), broadcaster);
        live.relay(broadcaster, SignalMessage.of("end"));

        mockMvc.perform(get("/api/broadcasts/" + started.id()))
                .andExpect(jsonPath("$.status").value("ENDED"))
                .andExpect(jsonPath("$.endedAt").isString());
        mockMvc.perform(get("/api/broadcasts?kind=LIVE"))
                .andExpect(jsonPath("$.items[0].status").value("ENDED"));
    }

    @Test
    void 라이브_목록은_시작_시각_최신순이고_종료된_방송도_포함하며_녹화방송은_섞이지_않는다() throws Exception {
        mockMvc.perform(multipart("/api/broadcasts").with(owner().credentials())
                        .file(new MockMultipartFile("video", "v.mp4", "video/mp4", BroadcastPagingApiTest.MP4_BYTES))
                        .param("title", "녹화"))
                .andExpect(status().isCreated());
        Started first = 시작한다("첫 라이브");
        Started second = 시작한다("둘째 라이브");

        String body = mockMvc.perform(get("/api/broadcasts?kind=LIVE"))
                .andReturn().getResponse().getContentAsString();
        List<Integer> ids = JsonPath.read(body, "$.items[*].id");
        assertThat(ids).containsExactly(second.id(), first.id());

        String all = mockMvc.perform(get("/api/broadcasts"))
                .andReturn().getResponse().getContentAsString();
        List<String> kinds = JsonPath.read(all, "$.items[*].kind");
        assertThat(kinds).containsExactly("LIVE", "LIVE", "RECORDING");
    }

    @Test
    void 라이브방송의_영상_요청은_404다() throws Exception {
        Started started = 시작한다("영상 없음");

        mockMvc.perform(get("/api/broadcasts/" + started.id() + "/video"))
                .andExpect(status().isNotFound());
    }
}
