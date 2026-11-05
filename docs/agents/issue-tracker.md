# Issue tracker: Local Markdown

이 저장소의 이슈와 스펙은 `.scratch/` 아래 마크다운 파일로 관리합니다.

## 규칙

- 기능 하나당 디렉터리 하나: `.scratch/<feature-slug>/`
- 스펙 파일은 `.scratch/<feature-slug>/spec.md`
- 구현 이슈는 티켓 하나당 파일 하나로 `.scratch/<feature-slug>/issues/<NN>-<slug>.md`에 두고, 번호는 `01`부터 매깁니다. 여러 티켓을 한 파일에 몰아 쓰지 않습니다.
- 트리아지 상태는 각 이슈 파일 상단 근처의 `Status:` 줄에 기록합니다 (역할 문자열은 `triage-labels.md` 참고).
- 댓글과 대화 기록은 파일 맨 아래 `## Comments` 제목 아래에 이어 붙입니다.

## 스킬이 "publish to the issue tracker"라고 할 때

`.scratch/<feature-slug>/` 아래에 새 파일을 만듭니다 (디렉터리가 없으면 함께 만듭니다).

## 스킬이 "fetch the relevant ticket"이라고 할 때

참조된 경로의 파일을 읽습니다. 보통 사용자가 경로나 이슈 번호를 직접 알려 줍니다.

## Wayfinding 작업

`/wayfinder`에서 사용합니다. **map**은 파일 하나이고, 티켓마다 **child** 파일이 하나씩 있습니다.

- **Map**: `.scratch/<effort>/map.md` (Notes / Decisions-so-far / Fog 본문).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, 번호는 `01`부터, 본문에 질문을 적습니다. `Type:` 줄에 티켓 유형(`research`/`prototype`/`grilling`/`task`)을, `Status:` 줄에 `claimed`/`resolved`를 기록합니다.
- **Blocking**: 상단 근처의 `Blocked by: NN, NN` 줄. 나열된 파일이 모두 `resolved`이면 차단이 풀린 것입니다.
- **Frontier**: `.scratch/<effort>/issues/`에서 열려 있고, 차단되지 않았고, 아무도 claim하지 않은 파일을 찾습니다. 번호가 가장 앞선 것이 우선입니다.
- **Claim**: 작업을 시작하기 전에 `Status: claimed`로 바꾸고 저장합니다.
- **Resolve**: `## Answer` 제목 아래 답을 붙이고 `Status: resolved`로 바꾼 뒤, `map.md`의 Decisions-so-far에 맥락 포인터(요지 + 링크)를 추가합니다.
