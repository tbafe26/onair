# 브랜치, 릴리스, CI

## 브랜치

- GitHub Flow를 따른다. `main`은 항상 파이프라인을 통과한 상태이고, 릴리스는 `main`의 태그로 표시한다.
- 티켓 하나마다 `main`에서 브랜치를 하나 따고 PR 하나로 합친다. 이름은 `<type>/<티켓 번호>-<이름>`이다(예: `feat/04-live-start-end`). type은 커밋 type과 같다.
- PR은 merge commit으로 합친다. 만든 뒤 `gh pr merge <번호> --merge --auto --delete-branch`를 걸어 두면 필수 검사가 모두 통과한 뒤에 병합된다.
- 단계 도중의 `main`은 다음 버전의 개발 중 상태다(`CHANGELOG.md`의 `개발 중` 줄).
- 이미 릴리스한 버전의 긴급 수정은 그 태그에서 `hotfix/<버전>` 브랜치를 따서 patch 버전으로 릴리스하고, 같은 수정을 `main`에도 반영한다.

## 릴리스

- 버전은 시맨틱 버전이다. 단계 하나가 minor 버전 하나(`v0.N.0`)이고, 단계 뒤의 버그 수정만 patch 버전을 올린다.
- 배포 이력은 루트 `CHANGELOG.md`의 표(`버전 | 배포일 | 주요 변경사항 | 상태`)와 그 아래 버전별 절로 관리한다. 상태는 `개발 중`, `최신`, `이전`, `철회` 중 하나다.
  - 다음 버전 작업을 시작하면 표 맨 위에 `개발 중` 줄을 두고 배포일은 `-`로 둔다.
  - 릴리스하면 그 줄을 `최신`과 배포일(한국 시간, `YYYY-MM-DD`)로 바꾸고, 직전 `최신`을 `이전`으로 바꾼다.
- 릴리스 순서
  1. 전체 검증 green과 실제 기기 통합 확인
  2. 마지막 티켓 PR에 `CHANGELOG.md` 갱신, 백엔드 `version`, 이번 버전의 스키마 스냅샷(아래)을 포함
  3. 파이프라인 통과 후 병합
  4. `main`에 annotated 태그(`vX.Y.Z`)를 달고 push
  5. GitHub 릴리스 생성(Latest, 본문은 `CHANGELOG.md`의 해당 버전 절)
  6. 같은 이름의 마일스톤과 단계의 부모 이슈 닫기
- 4·5번은 원격에 공개되는 작업이므로 실행 전에 사용자 확인을 받는다.

### 스키마 스냅샷

운영 DB는 `ddl-auto=update`로 이전 버전의 파일 DB를 그대로 고쳐 쓰고, 테스트는 매번 빈 DB로 시작한다. 이 차이로 v0.1.0 DB에서 라이브방송을 저장하지 못한 버그가 테스트를 통과했다. 그래서 릴리스마다 그 버전의 스키마를 `backend/src/test/resources/schema/`에 남기고, 업그레이드 테스트가 모든 스냅샷 위에서 앱을 띄워 확인한다. 만드는 방법과 추가 위치는 그 폴더의 업그레이드 테스트 클래스 주석에 있다.

## CI 파이프라인

- push와 PR마다 GitHub Actions(`.github/workflows/ci.yml`)가 테스트 → 품질 검사 → 빌드·패키징 순서로 돌린다. 앞 단계가 실패하면 뒤 단계는 돌지 않는다.
  - 테스트: 백엔드 `./gradlew test`, 프런트 `pnpm test`
  - 품질 검사: 백엔드 컴파일 경고를 오류로 처리(`-Xlint:all -Werror`), 프런트 `pnpm lint`, CodeQL, gitleaks, PR에서는 Dependency Review
  - 빌드·패키징: 백엔드 실행 jar, 프런트 정적 파일을 빌드 결과물로 보관
- `main`은 PR로만 바꾸고, 파이프라인 통과가 병합 조건이다(ruleset "main 보호").
- CodeQL 검사가 실패하면 경고 내용은 `gh api "repos/tbafe26/onair/code-scanning/alerts?ref=refs/pull/<번호>/merge&state=open"`로 읽는다.
- 스테이징·프로덕션 배포 단계는 아직 두지 않는다. 배포가 필요해지면 파이프라인 뒤에 추가한다.
