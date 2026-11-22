package com.onair.media;

import java.nio.file.Path;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * 미디어 서버가 공유 폴더에 쓴 HLS 재생 목록과 조각을 /hls/로 내준다.
 * 재생 목록은 1초마다 바뀌므로 캐시하지 않게 하고, 조각도 같은 규칙으로 두어 매번 수정 시각으로 확인한다.
 */
@Configuration
class HlsDeliveryConfig implements WebMvcConfigurer {

    private final Path directory;

    HlsDeliveryConfig(@Value("${app.hls.dir}") Path directory) {
        this.directory = directory;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = directory.toAbsolutePath().toUri().toString();
        registry.addResourceHandler("/hls/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/")
                .setCacheControl(CacheControl.noCache());
    }
}
