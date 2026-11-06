# 비밀 값 유출 방지: 경로별 방어

필수 규칙은 `AGENTS.md`에 있다. 여기에는 비밀 값과 개인 정보가 나갈 수 있는 경로마다 무엇이 막는지 적는다. 하나가 뚫려도 다음 단계에서 걸린다.

- `.gitignore`: `.env`, 인증서·개인 키·키 저장소, 인증 정보가 든 로컬 설정, 로그를 제외한다. 새 종류의 비밀 파일이 생기면 먼저 규칙을 추가한다.
- git 훅(`.githooks/`): clone한 뒤 `git config core.hooksPath .githooks`로 한 번 켠다. gitleaks나 node가 없으면 훅이 커밋과 push를 막는다.
  - pre-commit: 스테이징된 변경을 gitleaks(`.gitleaks.toml`의 사용자 규칙 포함)와 `check-public-text.js --staged`로 검사한다.
  - commit-msg: `check-commit-msg.js`가 형식을, `check-public-text.js`가 개인 정보를 검사한다.
  - pre-push: 올라갈 커밋을 gitleaks로 검사한다.
  - `check-public-text.js`는 사설 IP, 사용자 경로, 이 PC의 호스트·Wi-Fi 이름과 LAN 주소를 찾는다. 이 PC의 실제 값은 실행할 때 읽어 비교만 하므로 저장소에 남지 않는다.
- 이슈·PR·릴리스·댓글: Claude Code의 PreToolUse 훅(`.claude/settings.local.json`, git 제외)이 `gh`로 글을 올리는 명령의 텍스트와 본문 파일을 `check-public-text.js --hook`으로 검사해 막는다. 본문 파일은 `.scratch/tmp/`에 두고 상대 경로로 넘긴다. 사람이 직접 올릴 때는 `node .githooks/check-public-text.js <본문 파일>`로 먼저 검사한다.
- CI: gitleaks가 커밋 이력 전체를 검사하고, `main` 보호 규칙이 이 검사의 통과를 병합 조건으로 건다.
- GitHub: secret scanning과 push protection이 알려진 형식의 토큰이 담긴 push를 거절한다.
- 코드: 비밀 값과 송출 키를 로그, 오류 응답, 조회 응답, 주소, `toString`에 넣지 않는다. 프런트에서 `VITE_`로 시작하는 환경변수는 번들에 그대로 들어가므로 비밀 값을 두지 않는다.
- 커밋 작성자 이메일은 GitHub noreply 주소를 쓴다.
- 비밀 값이 이미 커밋되었다면 기록에서 지우는 것보다 먼저 그 값을 폐기·교체한다.
- gh 토큰의 `workflow` 권한은 평소에 두지 않는다. `.github/workflows/`를 바꾼 커밋을 push할 때만 사용자가 `gh auth refresh -h github.com -s workflow`로 잠시 추가하고, push가 끝나면 `gh auth refresh -h github.com -r workflow`로 바로 회수한다. 권한 추가와 회수는 브라우저 인증이 필요해 사용자가 직접 한다.
