# 온에어

[![CI](https://github.com/tbafe26/onair/actions/workflows/ci.yml/badge.svg)](https://github.com/tbafe26/onair/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/tbafe26/onair)](https://github.com/tbafe26/onair/releases/latest)

녹화방송 · 휴대폰 라이브 송출 · 실시간 채팅 · 후원이 되는 방송 서비스입니다.

<p align="center">
  <img src="docs/images/live-watch.png" alt="라이브방송 시청 화면: 송출 영상, 후원 합계와 내역, 채팅과 후원 상자" width="100%">
</p>

| 방송 목록 | 후원 패널 | 결제 |
| --- | --- | --- |
| <img src="docs/images/broadcast-list.png" alt="녹화방송 목록" width="100%"> | <img src="docs/images/donation-panel.png" alt="채팅 위에 열린 후원 패널" width="100%"> | <img src="docs/images/donation-payment.png" alt="화면 가운데 모달의 테스트 결제위젯" width="100%"> |

> 화면의 채널·방송·채팅은 모두 데모용 더미 데이터이고, 결제는 토스페이먼츠 테스트 모드입니다.

## 주요 기능

- **방송**: 영상을 올려 녹화방송으로 재생하고, 휴대폰 카메라로 라이브 송출해 다른 기기에서 시청합니다.
- **사용자와 권한**: 가입·로그인하면 내가 올리거나 송출한 방송을 직접 관리(제목 수정, 삭제, 송출 종료)합니다.
- **댓글과 채팅**: 녹화방송에는 댓글을 남기고, 라이브방송에서는 실시간으로 채팅합니다.
- **후원**: 방송 중인 라이브방송에 금액과 메시지를 골라 테스트 결제로 후원하면, 채팅에 바로 나타나고 방송별 내역과 합계에 쌓입니다.

## 기술 스택

| 영역 | 기술 |
| --- | --- |
| 백엔드 | ![Java](https://img.shields.io/badge/Java_25-000000?logo=openjdk&logoColor=white) ![Spring Boot](https://img.shields.io/badge/Spring_Boot_4-6DB33F?logo=springboot&logoColor=white) ![Spring Security](https://img.shields.io/badge/Spring_Security-6DB33F?logo=springsecurity&logoColor=white) ![H2](https://img.shields.io/badge/H2-09476B?logo=h2database&logoColor=white) ![Gradle](https://img.shields.io/badge/Gradle-02303A?logo=gradle&logoColor=white) |
| 프런트엔드 | ![React](https://img.shields.io/badge/React-20232A?logo=react&logoColor=61DAFB) ![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-646CFF?logo=vite&logoColor=white) ![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?logo=tailwindcss&logoColor=white) ![pnpm](https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white) |
| 실시간 | ![WebRTC](https://img.shields.io/badge/WebRTC-333333?logo=webrtc&logoColor=white) ![WebSocket](https://img.shields.io/badge/WebSocket-010101?logoColor=white) |
| 결제 | ![Toss Payments](https://img.shields.io/badge/토스페이먼츠_결제위젯-3182F6?logoColor=white) |
| 테스트·CI | ![JUnit](https://img.shields.io/badge/JUnit_5-25A162?logo=junit5&logoColor=white) ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?logo=vitest&logoColor=white) ![GitHub Actions](https://img.shields.io/badge/GitHub_Actions-2088FF?logo=githubactions&logoColor=white) ![CodeQL](https://img.shields.io/badge/CodeQL-2F4F4F?logo=github&logoColor=white) ![gitleaks](https://img.shields.io/badge/gitleaks-CC2936?logoColor=white) |

## 구성

<p align="center">
  <img src="docs/images/architecture.svg" alt="시청자·송출자 → 웹 화면(React) → API 서버(Spring Boot) → H2·영상 파일, 토스페이먼츠 결제위젯·승인 API·승인 통지" width="100%">
</p>

| 구성 | 역할 |
| --- | --- |
| 웹 화면 | React SPA. 개발 서버가 `/api`를 백엔드로 넘겨 같은 출처로 동작합니다(CORS 없음). |
| REST API | 방송·댓글·후원 API. 로그인은 서버 세션 쿠키, 상태를 바꾸는 요청은 CSRF 토큰으로 보호합니다. |
| 시그널링 WebSocket | 송출자와 시청자의 WebRTC 연결 신호를 중계하고, 송출자의 생존 신호로 끊긴 방송을 정리합니다. |
| 채팅 WebSocket | 저장된 채팅과 확정된 후원을 방송 중인 화면에 실시간으로 보냅니다(쓰기는 REST). |
| 영상 | 라이브 영상은 송출자와 시청자가 WebRTC로 직접 주고받고, 서버는 영상을 거치지 않습니다. |
| 결제 | 브라우저는 토스 결제위젯으로 결제하고, 서버가 토스 승인 API로 확정합니다. 승인 통지(웹훅)도 받습니다. |

## 기술적 고민과 해결

### 1. 결제 확정과 중복 방지

- **상황**: 결제창이 "성공"으로 돌아와도 그 값은 화면이 보낸 것이라 믿을 수 없고, 같은 결제의 승인 요청이나 승인 통지가 여러 번·동시에 들어올 수 있었습니다.
- **과제**: 실제로 승인된 결제만, 정해진 금액과 받는 사람으로, 정확히 한 번 적립해야 했습니다.
- **행동**: 결제 전에 서버가 금액과 받는 사람(방송 소유자)을 정해 대기 후원을 만들고, 승인 때 저장값을 대조한 뒤 토스 승인 API를 호출해 응답의 상태·금액·주문 번호까지 다시 확인했습니다. 확정은 "아직 확정되지 않았을 때만 바꾸는" 조건부 갱신으로 하고, 주문 번호와 결제 키에 unique 제약을 걸었습니다. 승인 통지는 본문을 믿지 않고 토스에 다시 조회해 같은 경로를 타게 했습니다. 코드 리뷰에서 "결제는 됐는데 그사이 취소 기록이 먼저 들어가 후원이 사라지는" 경쟁 상태를 찾아, 결제가 확인되면 확정하도록 고쳤습니다.
- **결과**: 같은 승인을 반복·동시에 보내거나 승인 통지가 겹쳐도 후원은 한 건만 확정되고, 이를 동시성 테스트와 실제 테스트 결제로 확인했습니다.

### 2. 미디어 서버 없는 휴대폰 라이브 송출

- **상황**: 휴대폰 카메라 영상을 다른 기기에서 실시간으로 봐야 했지만, 별도 미디어 서버를 운영하기에는 규모가 작았습니다.
- **과제**: 서버 부담 없이 지연이 짧은 송출과, 송출이 끊겼을 때의 정리가 필요했습니다.
- **행동**: 영상은 WebRTC P2P로 송출자와 시청자가 직접 주고받고, 서버는 WebSocket으로 연결 신호만 중계하게 했습니다. 송출자 생존 신호가 30초 넘게 끊기면 방송을 종료하고, 시청자 수 상한을 두었습니다. 휴대폰 카메라를 쓰려고 개발 서버를 HTTPS로 열었습니다.
- **결과**: 같은 네트워크에서 휴대폰 송출과 PC·휴대폰 시청이 되고, 송출 탭을 닫거나 연결이 끊긴 방송이 목록에 남지 않습니다.

### 3. 서버에서 하는 권한 검사

- **상황**: 로그인이 생기면서 방송 수정·삭제, 송출, 댓글 삭제를 누가 할 수 있는지 정해야 했고, 화면에서 버튼을 숨기는 것만으로는 막을 수 없었습니다.
- **과제**: 모든 요청을 서버가 같은 기준으로 판정하고, 송출 키가 새어 나가도 남이 송출하지 못하게 해야 했습니다.
- **행동**: Spring Security 서버 세션과 SPA용 CSRF 토큰을 쓰고, 판정 순서를 401(로그인) → 404(대상) → 403(소유자·작성자) → 409(상태)로 통일해 한 곳에서 검사했습니다. 송출자로 참가할 때는 송출 키와 함께 소유자인지도 확인했습니다.
- **결과**: 비로그인·소유자·다른 사용자로 같은 요청을 보내는 표 형태의 테스트로 모든 권한을 확인합니다.

## 개발 과정

| 버전 | 내용 |
| --- | --- |
| [v0.1.0](https://github.com/tbafe26/onair/releases/tag/v0.1.0) | 녹화방송 등록·시청 |
| [v0.2.0](https://github.com/tbafe26/onair/releases/tag/v0.2.0) | 휴대폰 라이브 송출·시청 |
| [v0.3.0](https://github.com/tbafe26/onair/releases/tag/v0.3.0) | 회원가입·로그인, 방송 소유자 권한, 댓글·실시간 채팅 |
| [v0.4.0](https://github.com/tbafe26/onair/releases/tag/v0.4.0) | 라이브방송 후원(테스트 결제), 후원 내역·합계 |

- 단계마다 스펙을 쓰고 티켓으로 나눠, 티켓 하나를 브랜치·PR 하나로 개발했습니다(GitHub Flow).
- PR은 CI(테스트 → 품질 검사 → 빌드)를 통과해야 병합됩니다. 백엔드와 프런트는 공유 계약 파일로 메시지 형식을 함께 검사합니다.
- 릴리스마다 DB 스키마 스냅샷을 남기고, 이전 버전 DB에서 새 버전이 뜨는지 업그레이드 테스트로 확인합니다.
- 커밋 훅·CI의 gitleaks와 PR 본문 검사로 비밀 값과 개인 정보가 저장소에 올라가지 않게 막습니다.

변경 내역은 [CHANGELOG.md](CHANGELOG.md)에 있습니다.

## 실행 방법

필요 도구: JDK 25, Node.js, pnpm

```bash
cd backend
./gradlew bootRun
```

```bash
cd frontend
pnpm install
pnpm dev:local
```

PC에서 `http://localhost:5174`로 접속합니다. 휴대폰으로 송출하려면 `pnpm dev`로 HTTPS 개발 서버(5173)를 띄우고, 같은 Wi-Fi의 휴대폰에서 `https://<PC의 LAN 주소>:5173`으로 접속합니다(자체 서명 인증서 경고는 넘깁니다).

### 환경변수

모두 선택입니다. 바꿀 때만 `backend/.env.example`을 `backend/.env`로 복사해 고칩니다.

| 변수 | 기본값 | 설명 |
| --- | --- | --- |
| `H2_DB_PATH` | `~/.onair/db/onair` | DB 파일 위치 |
| `STORAGE_DIR` | `~/.onair/videos` | 영상·썸네일 저장 폴더 |
| `MAX_UPLOAD_SIZE` | `200MB` | 업로드 크기 상한 |
| `MAX_LIVE_VIEWERS` | `5` | 라이브방송 하나의 동시 시청자 상한 |
| `ALLOWED_ORIGINS` | `https://*:5173,http://localhost:5174` | WebSocket을 받을 화면 주소 |
| `TOSS_CLIENT_KEY` | 없음 | 토스페이먼츠 결제위젯 클라이언트 키(`test_gck_…`) |
| `TOSS_SECRET_KEY` | 없음 | 토스페이먼츠 결제위젯 시크릿 키(`test_gsk_…`) |
| `TOSS_TEST_CODE` | 없음 | 승인 실패를 재현하는 테스트 코드(예: `REJECT_CARD_PAYMENT`) |

후원을 쓰려면 토스페이먼츠 개발자 문서의 공개 결제위젯 테스트 키를 `backend/.env`에만 넣습니다. 키가 없으면 후원 주문만 503이고 나머지는 그대로 동작합니다. 공용 테스트 상점이므로 결제창에는 퀵계좌이체를 고르고 토스가 보여 주는 테스트 값만 씁니다(카드번호·실제 개인정보는 넣지 않습니다).
