package com.onair.media;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

/** 로컬 폴더 구현. 저장 파일 이름은 서버가 만든 UUID이고, 원본 파일명은 경로에 쓰지 않는다. */
@Component
class LocalMediaStorage implements MediaStorage {

    private final Path root;

    LocalMediaStorage(@Value("${app.storage.dir:${user.home}/.onair/videos}") String directory) {
        this.root = Path.of(directory).toAbsolutePath().normalize();
        try {
            Files.createDirectories(root);
        } catch (IOException e) {
            throw new UncheckedIOException("영상 저장 폴더를 만들 수 없습니다: " + root, e);
        }
    }

    @Override
    public Batch begin() {
        return new LocalBatch();
    }

    @Override
    public Optional<Resource> open(String key) {
        Path path = resolve(key);
        return Files.isRegularFile(path) ? Optional.of(new FileSystemResource(path)) : Optional.empty();
    }

    @Override
    public void delete(String key) {
        try {
            Files.deleteIfExists(resolve(key));
        } catch (IOException e) {
            throw new UncheckedIOException("파일을 지우지 못했습니다: " + key, e);
        }
    }

    private final class LocalBatch implements Batch {

        private final List<String> keys = new ArrayList<>();
        private boolean committed;

        @Override
        public String store(InputStream content) {
            String key = UUID.randomUUID().toString();
            try {
                Files.copy(content, resolve(key), StandardCopyOption.REPLACE_EXISTING);
            } catch (IOException | RuntimeException e) {
                // 쓰다 만 파일이 남지 않게 한다.
                try {
                    Files.deleteIfExists(resolve(key));
                } catch (IOException cleanupFailure) {
                    e.addSuppressed(cleanupFailure);
                }
                if (e instanceof IOException io) {
                    throw new UncheckedIOException(io);
                }
                throw (RuntimeException) e;
            }
            keys.add(key);
            return key;
        }

        @Override
        public void commit() {
            committed = true;
        }

        @Override
        public void close() {
            if (committed) {
                return;
            }
            UncheckedIOException failure = null;
            for (String key : keys) {
                try {
                    Files.deleteIfExists(resolve(key));
                } catch (IOException e) {
                    if (failure == null) {
                        failure = new UncheckedIOException("저장한 파일을 지우지 못했습니다: " + key, e);
                    } else {
                        failure.addSuppressed(e);
                    }
                }
            }
            keys.clear();
            if (failure != null) {
                throw failure;
            }
        }
    }

    // 키는 서버가 만든 UUID지만, 읽을 때도 저장 폴더 밖으로 나가지 못하게 막는다.
    private Path resolve(String key) {
        Path path = root.resolve(key).normalize();
        if (!path.startsWith(root)) {
            throw new IllegalArgumentException("잘못된 저장 키입니다");
        }
        return path;
    }
}
