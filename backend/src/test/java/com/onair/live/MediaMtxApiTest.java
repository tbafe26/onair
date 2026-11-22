package com.onair.live;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

/** MediaMTX API adapter: 가짜 HTTP 서버로 요청 주소와 응답 해석을 확인한다. */
class MediaMtxApiTest {

    static final String BASE = "http://mediamtx.test";
    static final String PATH_LIST = BASE + "/v3/paths/list?itemsPerPage=1000";

    MockRestServiceServer server;

    MediaMtxApi api() {
        RestClient.Builder builder = RestClient.builder().baseUrl(BASE);
        server = MockRestServiceServer.bindTo(builder).build();
        return new MediaMtxApi(builder.build());
    }

    static final String PATHS = """
            {"pageCount":1,"itemCount":4,"items":[
              {"name":"live/3","ready":true,"source":{"type":"webRTCSession","id":"s-3"}},
              {"name":"live/4","ready":false,"source":null},
              {"name":"other/5","ready":true,"source":{"type":"webRTCSession","id":"s-5"}},
              {"name":"live/abc","ready":true,"source":{"type":"webRTCSession","id":"s-x"}}
            ]}""";

    @Test
    void 송출을_받고_있는_live_경로의_방송_id만_돌려준다() {
        MediaMtxApi api = api();
        server.expect(requestTo(PATH_LIST))
                .andExpect(method(HttpMethod.GET))
                .andRespond(withSuccess(PATHS, MediaType.APPLICATION_JSON));

        assertThat(api.publishingBroadcasts()).containsExactly(3L);
        server.verify();
    }

    @Test
    void 목록을_읽지_못하면_알_수_없음을_알린다() {
        MediaMtxApi api = api();
        server.expect(requestTo(PATH_LIST))
                .andRespond(withServerError());

        assertThatThrownBy(api::publishingBroadcasts).isInstanceOf(MediaServerUnavailableException.class);
    }

    @Test
    void 송출을_끊을_때는_그_경로의_송출_세션을_끊는다() {
        MediaMtxApi api = api();
        server.expect(requestTo(PATH_LIST))
                .andRespond(withSuccess(PATHS, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/v3/webrtcsessions/kick/s-3"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withSuccess());

        api.disconnect(3);
        server.verify();
    }

    @Test
    void 송출이_없는_방송을_끊으려_하면_아무것도_하지_않는다() {
        MediaMtxApi api = api();
        server.expect(requestTo(PATH_LIST))
                .andRespond(withSuccess(PATHS, MediaType.APPLICATION_JSON));

        api.disconnect(4);
        server.verify();
    }

    @Test
    void 끊는_요청이_실패하면_알_수_없음을_알린다() {
        MediaMtxApi api = api();
        server.expect(requestTo(PATH_LIST))
                .andRespond(withSuccess(PATHS, MediaType.APPLICATION_JSON));
        server.expect(requestTo(BASE + "/v3/webrtcsessions/kick/s-3"))
                .andRespond(withStatus(HttpStatus.NOT_FOUND));

        assertThatThrownBy(() -> api.disconnect(3)).isInstanceOf(MediaServerUnavailableException.class);
    }
}
