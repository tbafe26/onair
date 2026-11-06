package com.onair.broadcast;

import java.time.Clock;
import java.util.List;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** 방송 등록과 조회의 흐름만 맡는다. 등록 규칙은 RegistrationRules, 파일 보관은 MediaStorage가 맡는다. */
@Service
class BroadcastService {

    static final int DEFAULT_PAGE_SIZE = 20;
    static final int MAX_PAGE_SIZE = 50;

    private final BroadcastRepository repository;
    private final MediaStorage storage;
    private final RegistrationRules rules;
    private final Clock clock = Clock.systemUTC();

    BroadcastService(BroadcastRepository repository, MediaStorage storage, RegistrationRules rules) {
        this.repository = repository;
        this.storage = storage;
        this.rules = rules;
    }

    /** 등록 흐름: 입력 검증, 파일 저장, DB 기록, 확정 순이다. 중간에 실패하면 저장한 파일이 모두 지워진다. */
    Broadcast register(RegistrationForm form) {
        RegisterRecordingCommand command = rules.validate(form);

        try (MediaStorage.Batch batch = storage.begin()) {
            String videoKey = MultipartInputs.store(batch, command.video().file());
            String thumbnailKey = command.thumbnail() == null
                    ? null
                    : MultipartInputs.store(batch, command.thumbnail());

            Video video = new Video(
                    videoKey,
                    command.video().file().getOriginalFilename(),
                    command.video().format(),
                    command.video().file().getSize(),
                    command.duration(),
                    thumbnailKey);
            RecordingBroadcast saved = repository.save(
                    new RecordingBroadcast(command.title(), video, clock.instant()));
            batch.commit();
            return saved;
        }
    }

    /** 업로드 정책(크기 상한, 제목 길이). 화면이 서버와 같은 값으로 미리 검사하도록 알려 준다. */
    UploadPolicy uploadPolicy() {
        return rules.policy();
    }

    /** 최신 등록순 한 묶음. before가 null이면 가장 최신부터, 있으면 그 id보다 작은 방송만 돌려준다. size가 null이면 기본값이고, 50을 넘으면 50으로 줄이며, 1 미만이면 400 예외다. kind가 null이면 종류와 상관없이 전부이고, 알 수 없는 값은 400 예외다. */
    @Transactional(readOnly = true)
    BroadcastPage list(Long before, Integer requestedSize, String requestedKind) {
        BroadcastKind kind = parseKind(requestedKind);
        int size = requestedSize == null ? DEFAULT_PAGE_SIZE : requestedSize;
        if (size < 1) {
            throw new InvalidRequestException(List.of(new FieldViolation(
                    "size", "size는 1 이상이어야 합니다")));
        }
        size = Math.min(size, MAX_PAGE_SIZE);
        long cursor = before == null ? Long.MAX_VALUE : before;
        // 한 건 더 읽어 다음 묶음이 있는지 판단한다.
        PageRequest window = PageRequest.of(0, size + 1);
        List<Broadcast> found = switch (kind) {
            case null -> repository.findBefore(cursor, window);
            case RECORDING -> repository.findRecordingsBefore(cursor, window);
            case LIVE -> repository.findLiveBefore(cursor, window);
        };
        boolean hasNext = found.size() > size;
        List<BroadcastSummary> items = found.stream().limit(size).map(BroadcastResponses::summary).toList();
        return new BroadcastPage(items, hasNext);
    }

    private static BroadcastKind parseKind(String value) {
        if (value == null) {
            return null;
        }
        try {
            return BroadcastKind.valueOf(value);
        } catch (IllegalArgumentException e) {
            throw new InvalidRequestException(List.of(new FieldViolation(
                    "kind", "kind는 LIVE 또는 RECORDING이어야 합니다")));
        }
    }

    @Transactional(readOnly = true)
    BroadcastDetail detail(long id) {
        Broadcast broadcast = repository.findById(id).orElseThrow(() -> new BroadcastNotFoundException(id));
        return BroadcastResponses.detail(broadcast);
    }

    /** 썸네일 리소스를 연다. 방송이 없으면 404, 썸네일이 없으면 썸네일 없음 404, 저장된 파일이 사라졌으면 파일 없음 404 예외다. */
    @Transactional(readOnly = true)
    Resource thumbnail(long id) {
        String key = repository.findById(id).orElseThrow(() -> new BroadcastNotFoundException(id)).thumbnailKey();
        if (key == null) {
            throw new ThumbnailNotFoundException(id);
        }
        return storage.open(key).orElseThrow(() -> new MediaFileMissingException(id));
    }

    /** 영상 리소스와 저장된 파일 형식. 방송이 없거나 녹화방송이 아니면 404, 영상 파일이 사라졌으면 파일 없음 404 예외다. */
    @Transactional(readOnly = true)
    PlayableVideo video(long id) {
        RecordingBroadcast broadcast = findRecording(id);
        Resource resource = storage.open(broadcast.videoStorageKey())
                .orElseThrow(() -> new MediaFileMissingException(id));
        return new PlayableVideo(resource, broadcast.videoFormat());
    }

    record PlayableVideo(Resource resource, VideoFormat format) {
    }

    private RecordingBroadcast findRecording(long id) {
        return repository.findRecordingWithVideoById(id).orElseThrow(() -> new BroadcastNotFoundException(id));
    }
}
