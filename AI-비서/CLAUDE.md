# AI 비서 — 이어서 작업할 Claude에게 (인계 메모)

이 폴더는 **클로드 데스크톱 "AI 비서 만들기" 프로젝트**와 **PC의 Claude Code**가 같이 고쳐요. GitHub `berryst41/toy-store`가 중간 다리예요.
- 작업 시작 전에 꼭 최신 `main`을 받아요. 작업이 끝나면 `main`에 올리고(PR이면 머지까지), 아래 "작업 기록"에 한 줄 남겨요.
- 사용자는 초등학교 교사, git 비전문가 → 설명은 쉬운 우리말로.

## 지금 상태 (v0.1.0, 2026-11-20)
- 주소: https://berryst41.github.io/toy-store/AI-%EB%B9%84%EC%84%9C/ (GitHub Pages, main에 올리면 1~2분 뒤 반영)
- 사용자가 고른 것: ① 일정·할 일 ② 학교 업무 ③ 대화형 만능 — **셋 다 합친 비서**, **폰·PC 둘 다**에서 사용.
- 구조: `index.html` 한 파일에 전부(화면+코드). `sw.js`(네트워크 우선 캐시), `manifest.webmanifest`(설치·공유 받기), `icon-192/512.png`.
- AI: 구글 Gemini 무료 키(사용자가 ⚙️ 설정에 넣음, 기기 안에만 저장). 기본 모델 `gemini-flash-lite-latest`.
  - `gemini-flash-latest`는 무료 하루 20회라 쓰지 않음.
  - 응답은 JSON 스키마 `{reply, actions[]}`. actions: add_event / delete_event / add_todo / done_todo / delete_todo / add_memo / delete_memo.
  - 매번 system_instruction에 오늘 날짜·14일 달력·내 정보·기억·일정·할 일(id 포함)을 넣고, 최근 대화 16개만 보냄.
- 데이터: localStorage `ai-secretary` 키 하나(events, todos, memos, chat). 기기 간 이동은 ⚙️ 백업 파일 받기/불러오기.
- 화면: 💬 대화(빠른 버튼: 오늘 브리핑·이번 주·공문 요약·기안문·가정통신문·학부모 문자·생기부 문구·저녁 메뉴, 📎 파일 붙이기, 🎤 말로 하기) / 📅 일정·할 일 / 📒 기억.

## 시험한 것 / 못 한 것
- Playwright로 가짜 AI 답을 넣어 일정·할 일·기억 추가와 화면을 확인함(오류 없음).
- **실제 Gemini 키로는 아직 시험 못 함.**

## 남은 일 후보
- [ ] 실제 키로 써 보고 프롬프트 다듬기
- [ ] 폰 ↔ PC 자동 동기화 (지금은 백업 파일 옮기기)
- [ ] 일정 알림

## 고칠 때 규칙
- 버전을 올려요: `index.html`의 `VERSION`, `sw.js`의 `CACHE`, `README.md` 버전·업데이트 기록 표, 루트 `README.md` 진열장의 "열기 vX.Y.Z" 글자. 커밋 메시지 끝에도 `(X.Y.Z)`.

## 작업 기록
- 2026-11-20 · PC Claude Code: v0.1.0 처음 만듦
