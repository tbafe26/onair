package com.onair.media;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.containsStringIgnoringCase;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.onair.support.ApiTestSupport;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Comparator;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;

/** 미디어 서버가 공유 폴더에 쓴 HLS 재생 목록과 조각을 /hls/ 경로로 내준다. */
class HlsDeliveryApiTest extends ApiTestSupport {

    @Value("${app.hls.dir}")
    Path hlsDir;

    Path 쓴다(String relative, byte[] content) throws IOException {
        Path file = hlsDir.resolve(relative);
        Files.createDirectories(file.getParent());
        return Files.write(file, content);
    }

    @AfterEach
    void HLS_폴더를_지운다() throws IOException {
        if (!Files.exists(hlsDir)) {
            return;
        }
        try (var paths = Files.walk(hlsDir)) {
            for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
                Files.delete(path);
            }
        }
    }

    @Test
    void 재생_목록은_HLS_형식으로_내주고_캐시하지_않게_한다() throws Exception {
        String playlist = "#EXTM3U\n#EXT-X-VERSION:9\n";
        쓴다("live/7/index.m3u8", playlist.getBytes(StandardCharsets.UTF_8));

        mockMvc.perform(get("/hls/live/7/index.m3u8"))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", containsStringIgnoringCase("mpegurl")))
                .andExpect(header().string("Cache-Control", containsString("no-cache")))
                .andExpect(content().string(playlist));
    }

    @Test
    void 조각_파일은_쓴_그대로_내준다() throws Exception {
        byte[] segment = {0, 0, 0, 24, 'm', 'o', 'o', 'f', 1, 2, 3};
        쓴다("live/7/seg1.mp4", segment);

        mockMvc.perform(get("/hls/live/7/seg1.mp4"))
                .andExpect(status().isOk())
                .andExpect(content().bytes(segment));
    }

    @Test
    void 없는_파일은_404다() throws Exception {
        mockMvc.perform(get("/hls/live/7/index.m3u8")).andExpect(status().isNotFound());
    }
}
