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
- 주석은 코드만 보고 이유를 알 수 없을 때만 단다. 변경마다 설명 주석을 붙이지 않는다. 바꾼 이유는 커밋 메시지에 쓴다.
- 커밋 메시지는 Conventional Commits 형식으로 쓴다. type은 영어(`feat`, `fix`, `refactor`, `test`, `docs`, `chore`), 제목과 본문은 한국어다. 예: `feat: 녹화방송 등록 API 추가`
  - 제목은 50자 안팎, 끝에 마침표를 찍지 않는다. 제목과 본문 사이는 한 줄 띄운다.
  - 본문에는 무엇을 왜 바꿨는지 쓴다. 한 커밋에는 논리적 변경 하나만 담는다.
- 비밀 값은 git에서 제외한 `.env`에만 둔다. 저장소에는 더미 값을 넣은 `.env.example`만 둔다. 업로드된 영상과 DB 파일도 저장소 밖에 둔다.
- 권한은 서버에서 검사한다. 화면에서 버튼을 숨기는 것은 보조 수단이다. (3단계부터)
- 도네이션은 서버가 결제 승인, 금액, 수신 대상을 확인한 뒤에 확정한다. 같은 승인 통지가 반복되어도 한 번만 적립한다. (4단계)
- README에는 실행 방법, 환경변수 예시, 구현 범위, 직접 확인 절차와 정말 필요한 항목만 둔다.

## 비밀 값 유출 방지

비밀 값이 나갈 수 있는 경로마다 막는다. 하나가 뚫려도 다음 단계에서 걸린다.

### 필수 규칙: 공개되는 곳에 민감 정보를 올리지 않는다

공개되는 곳은 커밋(내용, 메시지, 파일 이름), 태그, 브랜치 이름, 이슈·PR·릴리스 본문과 댓글, CI 로그와 빌드 결과물이다.

- 금지: 비밀 값(토큰, 키, 비밀번호, 송출 키), IP 주소(사설 포함), 로컬 경로의 사용자 이름(`C:\Users\<이름>` 등), 기기·Wi-Fi·호스트 이름, 개인 이메일, 실제 사용자 데이터(업로드 영상, DB 내용, 스크린샷 속 개인 정보)
- 대신 자리표시를 쓴다: `<PC의 LAN 주소>`, `<사용자 홈>`, `~/.onair/...`
- 올리기 전에 직접 읽고 검사한다. 내가 쓰지 않았거나 도중에 바뀐 글도 예외가 없다. 커밋은 gitleaks(`.gitleaks.toml`의 사용자 규칙 포함)가, 이슈·PR 본문은 게시 직전의 패턴 검사가 맡는다.
- **애매하면 올리지 않고 사용자에게 먼저 확인한다.** 민감 정보인지 판단이 서지 않는 값, 검사에 걸렸지만 오탐으로 보이는 값, 허용 목록에 추가하려는 값이 여기에 해당한다.
- 예외: 커밋 작성자의 GitHub 계정 정보(이름, 이메일)는 사용자가 허용했다.

### 경로별 방어

- `.gitignore`: `.env`, 인증서·개인 키·키 저장소, 인증 정보가 든 로컬 설정, 로그를 제외한다. 새 종류의 비밀 파일이 생기면 먼저 규칙을 추가한다.
- git 훅(`.githooks/`): pre-commit은 스테이징된 변경을, commit-msg는 커밋 메시지를, pre-push는 올라갈 커밋을 검사해 막는다. 비밀 값은 gitleaks가, 개인 정보(사설 IP, 사용자 경로, 이 PC의 호스트·Wi-Fi 이름과 LAN 주소)는 `check-public-text.js`가 맡는다. 이 PC의 실제 값은 실행할 때 읽어 비교만 하므로 저장소에 남지 않는다. clone한 뒤 `git config core.hooksPath .githooks`로 한 번 켠다. gitleaks나 node가 없으면 훅이 커밋과 push를 막는다. `--no-verify`로 훅을 건너뛰지 않는다.
- 이슈·PR·릴리스·댓글: Claude Code의 PreToolUse 훅(`.claude/settings.local.json`, git 제외)이 `gh`로 글을 올리는 명령과 본문 파일을 `check-public-text.js --hook`으로 검사해 막는다. 사람이 직접 올릴 때는 `node .githooks/check-public-text.js <본문 파일>`로 먼저 검사한다.
- CI: gitleaks가 커밋 이력 전체를 검사하고, `main` 보호 규칙이 이 검사의 통과를 병합 조건으로 건다.
- GitHub: secret scanning과 push protection이 알려진 형식의 토큰이 담긴 push를 거절한다.
- 코드: 비밀 값과 송출 키를 로그, 오류 응답, 조회 응답에 넣지 않는다. 프런트에서 `VITE_`로 시작하는 환경변수는 번들에 그대로 들어가므로 비밀 값을 두지 않는다.
- 커밋 작성자 이메일은 GitHub noreply 주소를 쓴다.
- 비밀 값이 이미 커밋되었다면 기록에서 지우는 것보다 먼저 그 값을 폐기·교체한다.
- gh 토큰의 `workflow` 권한은 평소에 두지 않는다. `.github/workflows/`를 바꾼 커밋을 push할 때만 사용자가 `gh auth refresh -h github.com -s workflow`로 잠시 추가하고, push가 끝나면 `gh auth refresh -h github.com -r workflow`로 바로 회수한다. 권한 추가와 회수는 브라우저 인증이 필요해 사용자가 직접 한다.

## 브랜치

- GitHub Flow를 따른다. `main`은 항상 파이프라인을 통과한 상태이고, 릴리스는 `main`의 태그로 표시한다.
- 티켓 하나마다 `main`에서 브랜치를 하나 따고 PR 하나로 합친다. 이름은 `<type>/<티켓 번호>-<이름>`이다(예: `feat/04-live-start-end`). type은 커밋 type과 같다.
- 단계 도중의 `main`은 다음 버전의 개발 중 상태다(`CHANGELOG.md`의 `개발 중` 줄).
- 이미 릴리스한 버전의 긴급 수정은 그 태그에서 `hotfix/<버전>` 브랜치를 따서 patch 버전으로 릴리스하고, 같은 수정을 `main`에도 반영한다.

## 릴리스

- 버전은 시맨틱 버전이다. 단계 하나가 minor 버전 하나(`v0.N.0`)이고, 단계 뒤의 버그 수정만 patch 버전을 올린다.
- 배포 이력은 루트 `CHANGELOG.md`의 표(`버전 | 배포일 | 주요 변경사항 | 상태`)와 그 아래 버전별 절로 관리한다. 상태는 `개발 중`, `최신`, `이전`, `철회` 중 하나다.
  - 다음 버전 작업을 시작하면 표 맨 위에 `개발 중` 줄을 두고 배포일은 `-`로 둔다.
  - 릴리스하면 그 줄을 `최신`과 배포일(한국 시간, `YYYY-MM-DD`)로 바꾸고, 직전 `최신`을 `이전`으로 바꾼다.
- 릴리스 순서: 전체 검증 green → `CHANGELOG.md` 갱신(마지막 티켓 PR에 포함) → 파이프라인 통과 후 병합 → `main`에 annotated 태그(`vX.Y.Z`) → 태그 push → GitHub 릴리스 생성(본문은 `CHANGELOG.md`의 해당 버전 절) → 같은 이름의 마일스톤 닫기.
- 태그 push와 릴리스 생성은 원격에 공개되는 작업이므로 실행 전에 사용자 확인을 받는다.

## CI 파이프라인

- push와 PR마다 GitHub Actions가 테스트 → 품질 검사 → 빌드·패키징 순서로 돌린다. 앞 단계가 실패하면 뒤 단계는 돌지 않는다.
  - 테스트: 백엔드 `./gradlew test`, 프런트 `pnpm test`
  - 품질 검사: 백엔드 컴파일 경고를 오류로 처리(`-Xlint:all -Werror`), 프런트 `pnpm lint`, CodeQL, gitleaks, PR에서는 Dependency Review
  - 빌드·패키징: 백엔드 실행 jar, 프런트 정적 파일을 빌드 결과물로 보관
- `main`은 PR로만 바꾸고, 파이프라인 통과가 병합 조건이다.
- 스테이징·프로덕션 배포 단계는 아직 두지 않는다. 배포가 필요해지면 파이프라인 뒤에 추가한다.

## Agent skills

### Issue tracker

이슈와 스펙은 `.scratch/<feature-slug>/` 아래 로컬 마크다운 파일로 관리합니다. See `docs/agents/issue-tracker.md`.

### Triage labels

기본 5개 역할 라벨(`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`)을 이슈 파일의 `Status:` 줄에 그대로 씁니다. See `docs/agents/triage-labels.md`.

### Domain docs

single-context: 루트 `GLOSSARY.md` + `docs/adr/`. See `docs/agents/domain.md`.
