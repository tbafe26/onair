package com.onair.broadcast;

import com.onair.api.CursorPaging;
import com.onair.api.FieldViolation;
import com.onair.api.InvalidRequestException;
import com.onair.api.Requester;
import com.onair.auth.AppUser;
import com.onair.auth.AppUserRepository;
import com.onair.comment.Comments;
import com.onair.media.MediaFileMissingException;
import com.onair.media.MediaStorage;
import com.onair.media.MultipartInputs;
import java.time.Clock;
import java.util.List;
import java.util.function.Function;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

/** 방송 등록과 조회의 흐름만 맡는다. 등록 규칙은 RegistrationRules, 파일 보관은 MediaStorage가 맡는다. */
@Service
public class BroadcastService {

    private static final Logger log = LoggerFactory.getLogger(BroadcastService.class);

    private final BroadcastRepository repository;
    private final MediaStorage storage;
    private final RegistrationRules rules;
    private final AppUserRepository users;
    private final Comments comments;
    private final Clock clock;
    private final TransactionTemplate transaction;

    BroadcastService(BroadcastRepository repository, MediaStorage storage, RegistrationRules rules,
            AppUserRepository users, Comments comments, PlatformTransactionManager transactionManager,
            Clock clock) {
        this.clock = clock;
        this.comments = comments;
        this.transaction = new TransactionTemplate(transactionManager);
        this.users = users;
        this.repository = repository;
        this.storage = storage;
        this.rules = rules;
    }

    /**
     * 등록 흐름: 로그인 확인, 입력 검증, 파일 저장, DB 기록, 확정 순이다. 중간에 실패하면 저장한 파일이 모두 지워진다.
     * userId는 요청한 사용자이고 로그인하지 않았으면 null이다. 이 사용자가 방송의 소유자가 된다.
     */
    public Broadcast register(RegistrationForm form, Long userId) {
        AppUser owner = Requester.load(userId, users);
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
                    new RecordingBroadcast(command.title(), video, clock.instant(), owner));
            batch.commit();
            return saved;
        }
    }

    /**
     * 제목을 고친다. 로그인(401), 방송 존재(404), 소유자(403), 제목 규칙(400) 순으로 확인하고 고친 상세를 돌려준다.
     * userId는 요청한 사용자이고 로그인하지 않았으면 null이다.
     */
    @Transactional
    BroadcastDetail rename(long id, Long userId, String rawTitle) {
        Broadcast broadcast = OwnedBroadcasts.find(repository, id, userId);
        broadcast.rename(rules.validateTitle(rawTitle));
        return BroadcastResponses.detail(broadcast);
    }

    /**
     * 방송을 지운다. 확인 순서는 제목 수정과 같고, 방송 중인 라이브방송이면 409다.
     * 녹화방송은 영상 행도 함께 지우고, 저장된 영상·썸네일 파일은 DB 삭제가 확정된 뒤에 지운다.
     * 파일이 이미 없어도 성공으로 보고, 지우지 못한 파일은 방송이 이미 사라졌으므로 로그만 남긴다.
     */
    void delete(long id, Long userId) {
        List<String> keys = transaction.execute(status -> {
            Broadcast broadcast = OwnedBroadcasts.find(repository, id, userId);
            if (!broadcast.canDeleteNow()) {
                throw new LiveOnAirException(id);
            }
            List<String> fileKeys = broadcast.ownedFileKeys();
            comments.deleteAllOf(id);
            repository.delete(broadcast);
            return fileKeys;
        });
        for (String key : keys) {
            try {
                storage.delete(key);
            } catch (RuntimeException e) {
                log.warn("방송은 지웠지만 파일을 지우지 못했습니다: {}", key, e);
            }
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
        long cursor = CursorPaging.cursor(before);
        return page(requestedSize, window -> switch (kind) {
            case null -> repository.findBefore(cursor, window);
            case RECORDING -> repository.findRecordingsBefore(cursor, window);
            case LIVE -> repository.findLiveBefore(cursor, window);
        });
    }

    /** 내 방송 한 묶음. 목록과 같은 커서·크기 규칙이고, 로그인하지 않았으면(userId가 null) 401 예외다. */
    @Transactional(readOnly = true)
    BroadcastPage listMine(Long userId, Long before, Integer requestedSize) {
        long ownerId = Requester.id(userId);
        long cursor = CursorPaging.cursor(before);
        return page(requestedSize, window -> repository.findOwnedBefore(ownerId, cursor, window));
    }

    private BroadcastPage page(Integer requestedSize, Function<PageRequest, List<Broadcast>> finder) {
        CursorPaging.Slice<Broadcast> slice = CursorPaging.read(requestedSize, finder);
        List<BroadcastSummary> items = slice.items().stream().map(BroadcastResponses::summary).toList();
        return new BroadcastPage(items, slice.hasNext());
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
            throw new ThumbnailNotFoundException();
        }
        return storage.open(key).orElseThrow(() -> new MediaFileMissingException());
    }

    /** 영상 리소스와 저장된 파일 형식. 방송이 없거나 녹화방송이 아니면 404, 영상 파일이 사라졌으면 파일 없음 404 예외다. */
    @Transactional(readOnly = true)
    PlayableVideo video(long id) {
        RecordingBroadcast broadcast = findRecording(id);
        Resource resource = storage.open(broadcast.videoStorageKey())
                .orElseThrow(() -> new MediaFileMissingException());
        return new PlayableVideo(resource, broadcast.videoFormat());
    }

    record PlayableVideo(Resource resource, VideoFormat format) {
    }

    private RecordingBroadcast findRecording(long id) {
        return repository.findRecordingWithVideoById(id).orElseThrow(() -> new BroadcastNotFoundException(id));
    }
}
