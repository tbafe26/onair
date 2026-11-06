package com.onair.broadcast;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.auth.Csrf;
import com.jayway.jsonpath.JsonPath;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

/** 목록의 커서 방식 이어 불러오기: GET /api/broadcasts?before={id}&size={n}. */
class BroadcastPagingApiTest extends ApiTestSupport {

    static final byte[] MP4_BYTES = {
            0, 0, 0, 24, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 2, 0, 1, 2, 3, 4, 5, 6, 7, 8};

    int 등록한다(String title) throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts").with(Csrf.token())
                        .file(new MockMultipartFile("video", "v.mp4", "video/mp4", MP4_BYTES))
                        .param("title", title))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.id");
    }

    /** 방송 count개를 등록하고 id를 등록 순서대로 돌려준다. */
    List<Integer> 여러개_등록한다(int count) throws Exception {
        List<Integer> ids = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            ids.add(등록한다("방송 " + i));
        }
        return ids;
    }

    List<Integer> 목록_ids(String query) throws Exception {
        String body = mockMvc.perform(get("/api/broadcasts" + query))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.items[*].id");
    }

    boolean 목록_hasNext(String query) throws Exception {
        String body = mockMvc.perform(get("/api/broadcasts" + query))
                .andReturn().getResponse().getContentAsString();
        return JsonPath.read(body, "$.hasNext");
    }

    @Test
    void size를_주지_않으면_20개씩_최신순으로_돌려주고_더_있으면_hasNext가_참이다() throws Exception {
        List<Integer> ids = 여러개_등록한다(23);

        List<Integer> first = 목록_ids("");

        assertThat(first).hasSize(20);
        assertThat(first.get(0)).isEqualTo(ids.get(22));
        assertThat(first).isSortedAccordingTo((a, b) -> b - a);
        assertThat(목록_hasNext("")).isTrue();
    }

    @Test
    void before를_주면_그보다_작은_id만_돌려주고_끝이면_hasNext가_거짓이다() throws Exception {
        List<Integer> ids = 여러개_등록한다(5);
        int lastOfFirst = ids.get(2);

        List<Integer> next = 목록_ids("?before=" + lastOfFirst + "&size=10");

        assertThat(next).containsExactly(ids.get(1), ids.get(0));
        assertThat(목록_hasNext("?before=" + lastOfFirst + "&size=10")).isFalse();
    }

    @Test
    void 묶음을_이어_받으면_빠짐없이_한_번씩_나온다() throws Exception {
        List<Integer> ids = 여러개_등록한다(45);

        List<Integer> all = new ArrayList<>(목록_ids("?size=20"));
        all.addAll(목록_ids("?before=" + all.get(all.size() - 1) + "&size=20"));
        // 40개를 받았으니 아직 5개가 남아 있고, 마지막 묶음은 5개에서 끝난다.
        String lastQuery = "?before=" + all.get(all.size() - 1) + "&size=20";
        assertThat(목록_hasNext(lastQuery)).isFalse();
        all.addAll(목록_ids(lastQuery));

        assertThat(all).hasSize(ids.size()).doesNotHaveDuplicates();
    }

    @Test
    void size가_50을_넘으면_50으로_줄이고_1_미만이면_400이다() throws Exception {
        여러개_등록한다(52);

        assertThat(목록_ids("?size=50")).hasSize(50);
        assertThat(목록_ids("?size=51")).hasSize(50);
        assertThat(목록_hasNext("?size=51")).isTrue();
        for (String bad : new String[] {"?size=0", "?size=-1"}) {
            mockMvc.perform(get("/api/broadcasts" + bad))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.errors[0].field").value("size"));
        }
    }

    @Test
    void 첫_묶음을_받은_뒤_새_방송이_등록되어도_다음_묶음에_중복이_없다() throws Exception {
        List<Integer> ids = 여러개_등록한다(6);
        List<Integer> first = 목록_ids("?size=3");
        assertThat(first).containsExactly(ids.get(5), ids.get(4), ids.get(3));

        int newId = 등록한다("보는 도중 등록된 방송");

        List<Integer> next = 목록_ids("?before=" + first.get(2) + "&size=3");
        assertThat(next).containsExactly(ids.get(2), ids.get(1), ids.get(0));
        assertThat(next).doesNotContain(newId).doesNotContainAnyElementsOf(first);
    }
}
