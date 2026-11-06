package com.onair.donation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.jayway.jsonpath.JsonPath;
import com.onair.auth.AuthClient;
import com.onair.support.ApiTestSupport;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;

/** 결제 키 설정이 비어 있으면 주문을 만들지 않고 503으로 알린다. 설정 값이 달라 Spring 컨텍스트를 따로 띄운다. */
@TestPropertySource(properties = {"app.toss.client-key=", "app.toss.secret-key="})
class DonationNotConfiguredApiTest extends ApiTestSupport {

    @Test
    void 결제_키가_비어_있으면_503이고_후원을_저장하지_않는다() throws Exception {
        String body = mockMvc.perform(multipart("/api/broadcasts/live").with(owner().credentials()).param("title", "방송"))
                .andExpect(status().isCreated())
                .andReturn().getResponse().getContentAsString();
        int id = JsonPath.read(body, "$.id");
        AuthClient viewer = AuthClient.signedUp(mockMvc, "viewer01", "시청자닉");

        mockMvc.perform(post("/api/broadcasts/{id}/donations", id).with(viewer.credentials())
                        .contentType(MediaType.APPLICATION_JSON).content("{\"amount\":5000}"))
                .andExpect(status().isServiceUnavailable());

        assertThat(jdbc.queryForObject("select count(*) from donation", Long.class)).isZero();
    }
}
