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
- `pnpm test`는 감시 모드 없이 끝나고 `pnpm build`는 타입 검사를 포함하는 지금 형태를 유지한다.
- 화면을 브라우저로 직접 확인할 때는 `pnpm dev:local`(이 PC 전용 HTTP, `http://localhost:5174`)을 쓴다. 자체 서명 인증서를 받지 않는 브라우저에서도 열린다. 휴대폰은 `pnpm dev`(HTTPS)로 접속한다.
- JDK 25가 PATH에 없을 수 있다. `JAVA_HOME`이 비어 있으면 설치된 JDK 25(예: `~/.jdks/ms-25.0.4.1`)를 지정한 뒤 실행한다.

## 규칙

- 주석, 커밋 메시지, 문서는 한국어로 쓴다. 변수명과 함수명은 영어로 쓴다.
- 주석은 코드만 보고 이유를 알 수 없을 때만 단다. 변경마다 설명 주석을 붙이지 않는다. 바꾼 이유는 커밋 메시지에 쓴다.
- 커밋 메시지는 Conventional Commits 형식, 한국어 제목(50자 안팎)과 본문이다. 예: `feat: 녹화방송 등록 API 추가`. 형식은 commit-msg 훅이 검사한다.
  - 본문에는 무엇을 왜 바꿨는지 쓴다. 한 커밋에는 논리적 변경 하나만 담는다.
- 비밀 값은 git에서 제외한 `.env`에만 둔다. 저장소에는 더미 값을 넣은 `.env.example`만 둔다. 업로드된 영상과 DB 파일도 저장소 밖에 둔다.
- 권한은 서버에서 검사한다. 화면에서 버튼을 숨기는 것은 보조 수단이다. (3단계부터)
- 도네이션은 서버가 결제 승인, 금액, 수신 대상을 확인한 뒤에 확정한다. 같은 승인 통지가 반복되어도 한 번만 적립한다. (4단계)
- README에는 실행 방법, 환경변수 예시, 구현 범위, 직접 확인 절차와 정말 필요한 항목만 둔다.

## 필수 규칙: 공개되는 곳에 민감 정보를 올리지 않는다

공개되는 곳은 커밋(내용, 메시지, 파일 이름), 태그, 브랜치 이름, 이슈·PR·릴리스 본문과 댓글, CI 로그와 빌드 결과물이다.

- 금지: 비밀 값(토큰, 키, 비밀번호, 송출 키), IP 주소(사설 포함), 로컬 경로의 사용자 이름(`C:\Users\<이름>` 등), 기기·Wi-Fi·호스트 이름, 개인 이메일, 실제 사용자 데이터(업로드 영상, DB 내용, 스크린샷 속 개인 정보)
- 대신 자리표시를 쓴다: `<PC의 LAN 주소>`, `<사용자 홈>`, `~/.onair/...`
- 올리기 전에 직접 읽고 검사한다. 내가 쓰지 않았거나 도중에 바뀐 글도 예외가 없다. 커밋은 gitleaks(`.gitleaks.toml`의 사용자 규칙 포함)가, 이슈·PR 본문은 게시 직전의 패턴 검사가 맡는다.
- **애매하면 올리지 않고 사용자에게 먼저 확인한다.** 민감 정보인지 판단이 서지 않는 값, 검사에 걸렸지만 오탐으로 보이는 값, 허용 목록에 추가하려는 값이 여기에 해당한다.
- 예외(사용자가 허용함): 커밋 작성자의 GitHub 계정 정보(이름, 이메일), 커밋·태그의 시각과 시간대, 개발 환경의 종류(Windows PC, 안드로이드 휴대폰 등 기종이 드러나지 않는 수준)
- `--no-verify`로 훅을 건너뛰지 않는다. 훅에 막히면 원인을 없앤다.
- 경로별 방어(훅, CI, GitHub 설정, `workflow` 권한)를 바꾸거나 확인할 때 → `docs/secret-defense.md`

## 브랜치, 릴리스, CI

GitHub Flow, 티켓마다 `<type>/<티켓 번호>-<이름>` 브랜치와 PR 하나. 태그 push와 릴리스 생성은 실행 전에 사용자 확인을 받는다. 브랜치를 따거나 PR을 병합하거나 릴리스할 때 → `docs/release.md`

## Agent skills

### Issue tracker

이슈와 스펙은 `.scratch/<feature-slug>/` 아래 로컬 마크다운 파일로 관리합니다. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)을 이슈 파일의 `Status:` 줄에 그대로 씁니다. See `docs/agents/triage-labels.md`.

### Domain docs

single-context: 루트 `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
