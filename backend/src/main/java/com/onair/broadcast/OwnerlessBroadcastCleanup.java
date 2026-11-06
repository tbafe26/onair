package com.onair.broadcast;

import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 소유자가 생기기 전에 올라온 방송을 서버가 시작할 때 영상 행, 영상·썸네일 파일과 함께 지운다.
 * 소유자 없는 방송이 없으면 아무것도 하지 않으므로 두 번째 시작부터는 할 일이 없다.
 *
 * <p>행은 한 트랜잭션으로 지우고, 파일은 그 뒤에 지운다. 파일이 이미 없거나 지우지 못해도 시작을 멈추지 않고 경고만 남긴다.
 * 지운 데이터는 되돌릴 수 없다.
 */
@Component
class OwnerlessBroadcastCleanup implements ApplicationRunner {

    private static final Logger log = LoggerFactory.getLogger(OwnerlessBroadcastCleanup.class);

    private static final String OWNERLESS_IDS = "(select id from broadcast where owner_id is null)";

    private final JdbcTemplate jdbc;
    private final MediaStorage storage;
    private final TransactionTemplate transaction;

    OwnerlessBroadcastCleanup(JdbcTemplate jdbc, MediaStorage storage, PlatformTransactionManager transactionManager) {
        this.jdbc = jdbc;
        this.storage = storage;
        this.transaction = new TransactionTemplate(transactionManager);
    }

    @Override
    public void run(ApplicationArguments args) {
        int removed = cleanUp();
        if (removed > 0) {
            log.warn("소유자 없는 방송 {}건을 파일과 함께 지웠습니다", removed);
        }
    }

    /** 지운 방송 수를 돌려준다. */
    int cleanUp() {
        List<String> fileKeys = new ArrayList<>();
        Integer removed = transaction.execute(status -> deleteRows(fileKeys));
        for (String key : fileKeys) {
            if (key != null) {
                deleteQuietly(key);
            }
        }
        return removed == null ? 0 : removed;
    }

    private int deleteRows(List<String> fileKeys) {
        Integer count = jdbc.queryForObject("select count(*) from broadcast where owner_id is null", Integer.class);
        if (count == null || count == 0) {
            return 0;
        }
        jdbc.query("select v.storage_key, v.thumbnail_key from video v "
                        + "join recording_broadcast r on r.video_id = v.id where r.id in " + OWNERLESS_IDS,
                rs -> {
                    fileKeys.add(rs.getString(1));
                    fileKeys.add(rs.getString(2));
                });
        jdbc.query("select thumbnail_key from live_broadcast where id in " + OWNERLESS_IDS,
                rs -> {
                    fileKeys.add(rs.getString(1));
                });
        List<Long> videoIds = jdbc.queryForList(
                "select video_id from recording_broadcast where id in " + OWNERLESS_IDS, Long.class);
        // 자식 테이블부터 지운다. 영상 행은 녹화방송 행이 사라진 뒤에 지운다.
        jdbc.update("delete from recording_broadcast where id in " + OWNERLESS_IDS);
        jdbc.update("delete from live_broadcast where id in " + OWNERLESS_IDS);
        jdbc.update("delete from broadcast where owner_id is null");
        for (Long videoId : videoIds) {
            jdbc.update("delete from video where id = ?", videoId);
        }
        return count;
    }

    private void deleteQuietly(String key) {
        try {
            storage.delete(key);
        } catch (RuntimeException e) {
            log.warn("소유자 없는 방송의 파일을 지우지 못했습니다: {}", key, e);
        }
    }
}
