# AGENTS.md

방송 서비스. 단계별로 확장한다: 1단계 녹화방송 등록·시청 → 2단계 휴대폰 라이브 송출·시청 → 3단계 인증·인가와 댓글 → 4단계 도네이션.

## 구조

- `backend/`: Spring Boot 4, Java 25, Gradle(Kotlin DSL). API 서버, 포트 8080.
- `frontend/`: React, Vite, TypeScript, pnpm. 개발 서버 포트 5173.
- 화면은 API를 `/api/...` 상대 경로로 호출한다. 개발 중에는 Vite 프록시가 `/api`를 8080으로 넘기므로 같은 출처로 동작한다. CORS 설정은 두지 않는다.

## 검증

편집하는 동안에는 바꾼 곳의 테스트만 돌린다.

```bash
cd backend && ./gradlew test --tests BroadcastPagingApiTest
```

```bash
cd frontend && pnpm vitest run src/pages/BroadcastDetailPage.test.tsx
```

작업을 끝내기 전에 두 명령이 모두 green이어야 한다. 백엔드 → 프런트 순서로 하나씩 돌리고, 동시에 돌리지 않는다(동시에 돌리면 부하로 프런트 테스트가 실패할 수 있다).

```bash
cd backend && ./gradlew build
```

```bash
cd frontend && pnpm lint && pnpm test && pnpm build
```

- `./gradlew build`는 컴파일과 테스트를 함께 돌린다. Gradle이 `UP-TO-DATE`나 `FROM-CACHE`로 건너뛴 테스트는 입력이 같아 결과도 같으므로 통과로 본다.
- 백엔드 MockMvc API 테스트는 `ApiTestSupport`를 상속하고 테스트 설정(`src/test/resources/application.properties`)을 그대로 쓴다. 그래야 테스트 클래스들이 Spring 컨텍스트 하나를 함께 쓴다. 클래스 전용 설정 값(`@DynamicPropertySource`)이나 스파이 빈은 컨텍스트를 새로 띄우므로, 그 값이 꼭 필요한 테스트에만 둔다. 서블릿 컨테이너를 거쳐야 하는 테스트(예: 멀티파트 상한)만 실제 포트(`RANDOM_PORT`)로 따로 띄운다.
- `pnpm test` 스크립트는 감시 모드 없이 끝나는 `vitest run`으로 유지한다.
- `pnpm build` 스크립트는 `tsc -b && vite build`로 유지해 타입 검사를 포함한다.
- JDK 25가 PATH에 없을 수 있다. `JAVA_HOME`이 비어 있으면 설치된 JDK 25(예: `~/.jdks/ms-25.0.4.1`)를 지정한 뒤 실행한다.

## 규칙

- 주석, 커밋 메시지, 문서는 한국어로 쓴다. 변수명과 함수명은 영어로 쓴다.
- 커밋 메시지는 Conventional Commits 형식으로 쓴다. type은 영어(`feat`, `fix`, `refactor`, `test`, `docs`, `chore`), 제목과 본문은 한국어다. 예: `feat: 녹화방송 등록 API 추가`
  - 제목은 50자 안팎, 끝에 마침표를 찍지 않는다. 제목과 본문 사이는 한 줄 띄운다.
  - 본문에는 무엇을 왜 바꿨는지 쓴다. 한 커밋에는 논리적 변경 하나만 담는다.
- 비밀 값은 git에서 제외한 `.env`에만 둔다. 저장소에는 더미 값을 넣은 `.env.example`만 둔다. 업로드된 영상과 DB 파일도 저장소 밖에 둔다.
- 권한은 서버에서 검사한다. 화면에서 버튼을 숨기는 것은 보조 수단이다. (3단계부터)
- 도네이션은 서버가 결제 승인, 금액, 수신 대상을 확인한 뒤에 확정한다. 같은 승인 통지가 반복되어도 한 번만 적립한다. (4단계)
- README에는 실행 방법, 환경변수 예시, 구현 범위, 직접 확인 절차와 정말 필요한 항목만 둔다.

## Agent skills

### Issue tracker

이슈와 스펙은 `.scratch/<feature-slug>/` 아래 로컬 마크다운 파일로 관리합니다. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)을 이슈 파일의 `Status:` 줄에 그대로 씁니다. See `docs/agents/triage-labels.md`.

### Domain docs

single-context: 루트 `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
