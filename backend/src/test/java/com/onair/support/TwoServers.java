package com.onair.support;

import com.onair.OnAirApplication;
import java.net.CookieManager;
import java.net.HttpCookie;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * 같은 DB(테스트 설정의 Testcontainers 주소)를 쓰는 서버 두 대와, 두 서버를 오가는 브라우저 한 대.
 *
 * <p>로드밸런서 뒤의 서버들처럼 같은 호스트(localhost)에 포트만 다르게 띄운다. 쿠키는 포트를 가리지 않으므로
 * 한 서버에서 받은 세션·CSRF 쿠키가 다른 서버로도 간다.
 */
public final class TwoServers implements AutoCloseable {

    private final ConfigurableApplicationContext first;
    private final ConfigurableApplicationContext second;
    private final CookieManager cookies = new CookieManager();
    private final HttpClient http = HttpClient.newBuilder().cookieHandler(cookies).build();

    private TwoServers(ConfigurableApplicationContext first, ConfigurableApplicationContext second) {
        this.first = first;
        this.second = second;
    }

    public static TwoServers start() {
        ConfigurableApplicationContext first = launch();
        try {
            return new TwoServers(first, launch());
        } catch (RuntimeException e) {
            first.close();
            throw e;
        }
    }

    private static ConfigurableApplicationContext launch() {
        return new SpringApplicationBuilder(OnAirApplication.class).run("--server.port=0");
    }

    public URI first(String path) {
        return uri(first, path);
    }

    public URI second(String path) {
        return uri(second, path);
    }

    private static URI uri(ConfigurableApplicationContext context, String path) {
        return URI.create("http://localhost:" + context.getEnvironment().getProperty("local.server.port") + path);
    }

    public HttpResponse<String> get(URI uri) throws Exception {
        return http.send(HttpRequest.newBuilder(uri).GET().build(), HttpResponse.BodyHandlers.ofString());
    }

    /** 상태를 바꾸는 요청. 마지막으로 받은 CSRF 토큰 쿠키를 헤더에도 실어 보낸다(화면이 하는 그대로). */
    public HttpResponse<String> post(URI uri, String json) throws Exception {
        HttpRequest.Builder request = HttpRequest.newBuilder(uri)
                .header("Content-Type", "application/json")
                .header("X-XSRF-TOKEN", csrfToken())
                .POST(json == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(json));
        return http.send(request.build(), HttpResponse.BodyHandlers.ofString());
    }

    private String csrfToken() {
        List<HttpCookie> all = cookies.getCookieStore().getCookies();
        return all.stream().filter(c -> c.getName().equals("XSRF-TOKEN")).map(HttpCookie::getValue)
                .reduce((older, newer) -> newer)
                .orElseThrow(() -> new IllegalStateException("CSRF 토큰 쿠키가 없다. 먼저 GET 요청으로 받아야 한다"));
    }

    @Override
    public void close() {
        second.close();
        first.close();
    }
}
