package com.onair.live;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** MediaMTX 제어 API(v3) adapter. */
class MediaMtxApi implements MediaServer {

    private static final Pattern LIVE_PATH = Pattern.compile("live/(\\d{1,18})");

    private final RestClient client;

    MediaMtxApi(RestClient client) {
        this.client = client;
    }

    record PathList(List<Path> items) {
    }

    record Path(String name, boolean ready, Source source) {
    }

    record Source(String type, String id) {
    }

    @Override
    public Set<Long> publishingBroadcasts() {
        return readySources().keySet();
    }

    @Override
    public void disconnect(long broadcastId) {
        Source source = readySources().get(broadcastId);
        if (source == null || !"webRTCSession".equals(source.type())) {
            return;
        }
        try {
            client.post().uri("/v3/webrtcsessions/kick/{id}", source.id()).retrieve().toBodilessEntity();
        } catch (RestClientException e) {
            throw new MediaServerUnavailableException("미디어 서버의 송출을 끊지 못했습니다", e);
        }
    }

    private Map<Long, Source> readySources() {
        PathList list;
        try {
            list = client.get().uri("/v3/paths/list?itemsPerPage=1000").retrieve().body(PathList.class);
        } catch (RestClientException e) {
            throw new MediaServerUnavailableException("미디어 서버의 송출 목록을 읽지 못했습니다", e);
        }
        if (list == null || list.items() == null) {
            throw new MediaServerUnavailableException("미디어 서버의 송출 목록이 비어 있습니다", null);
        }
        Map<Long, Source> sources = new HashMap<>();
        for (Path path : list.items()) {
            broadcastIdOf(path).ifPresent(id -> sources.put(id, path.source()));
        }
        return sources;
    }

    private static Optional<Long> broadcastIdOf(Path path) {
        if (!path.ready() || path.name() == null) {
            return Optional.empty();
        }
        Matcher matcher = LIVE_PATH.matcher(path.name());
        return matcher.matches() ? Optional.of(Long.parseLong(matcher.group(1))) : Optional.empty();
    }
}
