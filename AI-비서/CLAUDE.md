# AI 비서 — 이어서 작업할 Claude에게 (인계 메모)

이 폴더는 **클로드 데스크톱 "AI 비서 만들기" 프로젝트**와 **PC의 Claude Code**가 같이 고쳐요. GitHub `berryst41/toy-store`가 중간 다리예요.
- 작업 시작 전에 꼭 최신 `main`을 받아요. 작업이 끝나면 `main`에 올리고(PR이면 머지까지), 아래 "작업 기록"에 한 줄 남겨요.
- 사용자는 초등학교 교사, git 비전문가 → 설명은 쉬운 우리말로.

## 지금 상태 (v0.3.0, 2026-11-20)
### 서버 (v0.2.0~)
- Supabase 프로젝트 **couple** (aaiplfmwljguzsvgdxit) — 커플 앱(my-own-/couple, 비공개)과 같은 곳. **AI 비서 칸은 모두 `ai_`로 시작**, `couple_*` 칸은 절대 건드리지 않기. 데이터 지우기·칸 지우기 금지(칸 추가 방식으로만 바꾸기).
- 표: `ai_owner`(주인 1명, 처음 가입자가 `ai_claim_owner()`로 차지), `ai_items`(id, user_id, kind=event|todo|memo|chat|approval, data jsonb, deleted, updated_at 트리거), `ai_profile`(me, settings.limit), `ai_usage`(day, count, limited_at; `ai_bump_usage(day, limited)`). 모두 RLS = 본인이면서 주인일 때만. ai_items는 realtime 켬.
- 로그인: 이메일+비밀번호(이 프로젝트는 메일 확인 없이 바로 가입됨 — 커플 앱이 그렇게 씀). 공개 키는 index.html에 있음(공개돼도 안전한 키).
- **실제 Supabase에 시험 계정 만들지 말 것** — 처음 가입한 계정이 주인이 돼 버림. 규칙 시험은 SQL에서 begin…(rollback) 안에서 가짜 사용자로.
- 동기화: 모든 변경은 `put()/remove()` → dirty 표시 → 서버 upsert(지우기는 deleted=true 표시만) → updated_at 이후 것 pull + realtime. 마지막 저장이 이김.
- **구글 연결(v0.3.0~):** Edge Function `ai-google`(소스: `supabase/functions/ai-google/index.ts`, verify_jwt=false — 안에서 직접 로그인·주인 확인). 표 `ai_google_accounts`(정책 없음 = 브라우저 접근 불가, 서버 함수만). refresh token은 AES-GCM으로 잠금(열쇠 = AI_TOKEN_KEY 또는 service role 키에서 만듦). 비밀값 GOOGLE_CLIENT_ID/SECRET은 사용자가 Supabase 대시보드에 넣어야 함(`구글연결-설정.md`). 넣기 전에는 config가 configured:false.
  - 동작: config / list / exchange / update / remove / context(모든 계정 일정+최근 메일) / mail_read / mail_search / cal_insert·cal_delete·mail_send(앱에서 [허락] 뒤에만, 서버가 다시 읽어 verified 돌려줌).
  - 앱 시험법: Playwright에서 `owner=true; G.accounts=[…]; gcall=async()=>…`로 흉내(최상위 let/function이라 바꿀 수 있음).
- 이 기기 저장 이름은 `ai.`로 시작(berryst41.github.io의 다른 장난감과 localStorage를 같이 쓰기 때문).

### 앱
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

## 앞으로 할 일
**전체 계획은 `계획.md`가 정본이에요(2026-11-20 사용자와 정함).** 요약: 전화 대행 빼고 피클처럼 — 일정(구글 캘린더)·메일(지메일), 구글 계정 여러 개 모두 연결·기억·먼저 제안·예약·쇼핑·빈자리 알림·대신 누르기. 실행·결제 전 반드시 허락, 실행 후 실제 상태 재확인, 남은 사용량 표시. 서버(Vercel+Supabase) 쓰기로 함. 비밀번호는 서버에 저장하지 않고 PC 일꾼이 PC 크롬 로그인 상태를 빌려 씀, 카드 번호 저장 안 함.
- [ ] 실제 키로 v0.1 써 보고 프롬프트 다듬기
- [x] 1단계 (v0.2.0): 서버 저장·동기화, 사용량 표시, 지우기 확인 카드, 저장 재확인
- [ ] 사용자가 실제로 가입·로그인해서 폰↔PC 동기화 되는지 확인 (가입 후 SQL로 ai_owner·ai_items 확인)
- [x] 2단계 앞부분 (v0.3.0): 구글 계정 여러 개 연결, 캘린더 합쳐 보기·넣기·지우기, 메일 탭·요약·답장, 허락 후 실행·확인
- [ ] 사용자가 구글연결-설정.md 따라 GOOGLE_CLIENT_ID/SECRET 넣기 → 실제 연결 시험
- [ ] 2단계 나머지: 기억 키우기, 아침 브리핑 알림(웹 푸시 + 정해진 시간 실행), 먼저 제안

## 고칠 때 규칙
- 버전을 올려요: `index.html`의 `VERSION`, `sw.js`의 `CACHE`, `README.md` 버전·업데이트 기록 표, 루트 `README.md` 진열장의 "열기 vX.Y.Z" 글자. 커밋 메시지 끝에도 `(X.Y.Z)`.

## 작업 기록
- 2026-11-20 · PC Claude Code: v0.1.0 처음 만듦
- 2026-11-20 · PC Claude Code: 피클 조사 → 계획.md 작성
- 2026-11-20 · PC Claude Code: v0.2.0 1단계 — couple Supabase에 ai_ 칸, 로그인·동기화·사용량·확인 카드
- 2026-11-20 · PC Claude Code: v0.3.0 — ai-google 서버 함수, 구글 계정 여러 개·캘린더·메일
