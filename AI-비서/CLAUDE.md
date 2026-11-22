# AI 비서 — 이어서 작업할 Claude에게 (인계 메모)

이 폴더는 **클로드 데스크톱 "AI 비서 만들기" 프로젝트**와 **PC의 Claude Code**가 같이 고쳐요. GitHub `berryst41/toy-store`가 중간 다리예요.
- 작업 시작 전에 꼭 최신 `main`을 받아요. 작업이 끝나면 `main`에 올리고(PR이면 머지까지), 아래 "작업 기록"에 한 줄 남겨요.
- 사용자는 초등학교 교사, git 비전문가 → 설명은 쉬운 우리말로.

## 지금 상태 (v0.9.0, 2026-11-22) — 최신 요약·할 일은 `정리.md` 7~9번
### 서버 (v0.2.0~)
- Supabase 프로젝트 **couple** (aaiplfmwljguzsvgdxit) — 커플 앱(my-own-/couple, 비공개)과 같은 곳. **AI 비서 칸은 모두 `ai_`로 시작**, `couple_*` 칸은 절대 건드리지 않기. 데이터 지우기·칸 지우기 금지(칸 추가 방식으로만 바꾸기).
- 표: `ai_owner`(주인 1명, 처음 가입자가 `ai_claim_owner()`로 차지), `ai_items`(id, user_id, kind=event|todo|memo|chat|approval, data jsonb, deleted, updated_at 트리거), `ai_profile`(me, settings.limit), `ai_usage`(day, count, limited_at; `ai_bump_usage(day, limited)`). 모두 RLS = 본인이면서 주인일 때만. ai_items는 realtime 켬.
- 로그인: 이메일+비밀번호(이 프로젝트는 메일 확인 없이 바로 가입됨 — 커플 앱이 그렇게 씀). 공개 키는 index.html에 있음(공개돼도 안전한 키).
- **실제 Supabase에 시험 계정 만들지 말 것** — 처음 가입한 계정이 주인이 돼 버림. 규칙 시험은 SQL에서 begin…(rollback) 안에서 가짜 사용자로.
- 동기화: 모든 변경은 `put()/remove()` → dirty 표시 → 서버 upsert(지우기는 deleted=true 표시만) → updated_at 이후 것 pull + realtime. 마지막 저장이 이김.
- **구글 연결(v0.3.0~):** Edge Function `ai-google`(소스: `supabase/functions/ai-google/index.ts`, verify_jwt=false — 안에서 직접 로그인·주인 확인). 표 `ai_google_accounts`(정책 없음 = 브라우저 접근 불가, 서버 함수만). refresh token은 AES-GCM으로 잠금(열쇠 = AI_TOKEN_KEY 또는 service role 키에서 만듦). 비밀값 GOOGLE_CLIENT_ID/SECRET은 사용자가 Supabase 대시보드에 넣어야 함(`구글연결-설정.md`). 넣기 전에는 config가 configured:false.
  - 동작: config / list / exchange / update / remove / context(모든 계정 일정+최근 메일) / mail_read / mail_search / cal_insert·cal_delete·mail_send(앱에서 [허락] 뒤에만, 서버가 다시 읽어 verified 돌려줌).
  - 앱 시험법: Playwright에서 `owner=true; G.accounts=[…]; gcall=async()=>…`로 흉내(최상위 let/function이라 바꿀 수 있음).
- **아침 브리핑(v0.4.0~):** 같은 함수 ai-google 안에 있음. pg_cron 작업 `ai-brief`가 5분마다 `{action:cron_brief}` + x-cron-secret(ai_push_config.cron_secret) 으로 부름 → ai_profile.settings.brief {on,time} 보고, 정한 시각~3시간 안 + ai_profile.brief_sent≠오늘이면 규칙으로 만든 브리핑을 web-push로 보냄(AI 안 씀). VAPID는 ai_push_config(서버가 처음 한 번 만듦), 구독은 ai_push_subs(RLS 주인). 앱 동작: push_key / push_test / brief. 알림 누르면 ./?brief=1 → 앱이 오늘 브리핑 대화를 자동으로 보냄.
- **먼저 제안:** 앱 suggestions()가 규칙으로 첫 화면 칩을 만듦(AI 안 씀). **기억 키우기:** 프롬프트 규칙 + add_memo(auto, 중복 건너뜀)/update_memo, 할 일 update_todo.
- **PC 일꾼(v0.5.0~):** `pc-일꾼/worker.js`(Node + playwright-core, 설치된 크롬/엣지를 channel로 띄움, 프로필 %LOCALAPPDATA%AI비서일꾼rowser). 표 ai_tasks(kind watch|do, status queued→running→need_ok→done/failed/stopped, need, answer yes|no, log, result{summary,verified,url}, shot=jpeg dataURL), ai_workers(30초 하트비트), ai_pair(10분 코드). 연결: 앱 pair_create(코드+이 기기 Gemini 키) → 일꾼 pair_use → generateLink(magiclink) token_hash → verifyOtp로 일꾼 전용 세션(login.json). 일꾼 알림은 ai-google notify. 위험 버튼 정규식 RISKY + AI risky면 need_ok. done은 evidence 글자가 화면에 있어야 verified. 시험: AIW_TEST=test.json (가짜 서버·가짜 AI, 로컬 html).
  - zip(`pc-일꾼.zip`)은 worker 파일 바꾸면 다시 만들기. bat은 CRLF(.gitattributes). 학교망: node --use-system-ca.
- **📱 캘린더 다리(v0.8.0~, 앱 v0.1.0):** 안드로이드 APK `calendar-bridge/`(순수 Java, 라이브러리 없음, 패키지 app.berryst.calbridge, minSdk 26/targetSdk 34). 로그인 = AI 딸기와 같은 이메일·비밀번호로 `/auth/v1/token?grant_type=password` → refresh token만 SharedPreferences에 저장, `ai_is_owner` RPC로 주인 확인. CalendarContract Calendars+Instances(어제~60일 뒤, 취소·거절 빼고, 최대 1500개) → 표 `ai_phone_cal`(PK user_id+device, calendars jsonb[{id,name,account,type,color,visible}], events jsonb[{id,cal,date,time,end,end_date,title,loc,all_day}], synced_at, RLS 주인, realtime) 에 기기 한 줄 통째 upsert. JobScheduler: 30분 주기(persisted) + 캘린더 바뀜 트리거(TriggerContentUri, 매번 다시 걸기), BootReceiver로 다시 걸기. **읽기만**(사용자 결정 2026-11-21, 넣기는 원하면 나중에 WRITE_CALENDAR). 앱 v0.2.0~: 화면에서 캘린더마다 체크, 끈 캘린더 id는 prefs `skip_cals`에 두고 목록·일정 모두 안 보냄(서버 줄을 통째로 바꾸니 AI 딸기에서도 사라짐). **앱 v0.3.0 / AI 딸기 v0.9.0~ 쓰기:** 사용자 결정(2026-11-22) 넣기·고치기·지우기 모두, 기본 캘린더 "공유용"(⚙️에서 바꿈 → `ai_phone_cal.write_cal`, 앱 upsert는 이 칸을 안 건드림). AI 액션 add/update/delete_phone_event → [허락] → 표 `ai_phone_cmd`(device, op, cal, event_id=Events._ID(+_begin), data{date,time,end,end_date,title,loc,all_day}, status wait→run→done/fail, result; RLS 주인, realtime) → 앱 `Cmd.process`(wait→run PATCH로 한 번만, 넣은 뒤 다시 읽어 확인, 반복 일정 고치기·지우기 거절). 깨우기: 안드로이드 웹이면 `intent://run#Intent;scheme=calbridge;package=app.berryst.calbridge;end`(WakeActivity 투명), 앱 화면 켜져 있으면 5초마다, 아니면 JobScheduler 15분. calendars에 can_write, events에 rec 추가. PC에서 허락할 때 바로 깨우기(FCM)는 아직 — Firebase 앱 등록 필요.
  - 겹침 빼기(앱 `phoneEvents()`·서버 buildBrief 같은 규칙): 숨긴 캘린더 빼기 / type=com.google 이고 account가 연결한 구글 계정 메일이면 빼기 / 같은 날짜·시각·제목이 이미 있으면 빼기. 폰 일정은 id `p_…`, `e.p=true`, 지우기 버튼 없음. AI 문맥 `[폰 캘린더]`.
  - 빌드: `.github/workflows/calendar-bridge.yml` — 한글 경로 피하려 `$RUNNER_TEMP/cb`로 복사해 gradle 8.7. 시크릿 `CALBRIDGE_KEYSTORE`(PKCS12 base64, alias calbridge, 비밀번호 calbridge-store는 build.gradle에 공개) 있으면 release 서명 + main이면 릴리스 태그 `calendar-bridge`에 `calendar-bridge.apk` --clobber. 없으면 debug만(시험). 열쇠 원본은 프로젝트 파일 `calendar-bridge-key/`(공개 저장소에 열쇠 넣지 말 것). 앱 버전은 `app/build.gradle`의 versionName, versionCode=run_number.
  - 로컬 컴파일 확인: 안드로이드 SDK 없음 → `org.robolectric:android-all` jar를 maven에서 받아 `javac -cp`로 문법만 확인(한글 경로면 ASCII 폴더로 복사).
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
- [x] 사용자가 구글연결-설정.md 따라 GOOGLE_CLIENT_ID/SECRET 넣기 → 앱 게시(프로덕션, 미인증) → 계정 3개 연결됨(2026-11-21)
- [ ] v0.7.3: 계정 3개 [🔧 범위]로 다시 허락 → `ai_google_accounts.scopes`에 calendar.calendarlist.readonly 있는지 확인
- [x] 삼성 캘린더 읽기 = B안 캘린더 다리 (v0.8.0, 2026-11-21). 사용자: 갤럭시 S26·안드로이드 17, APK 직접 설치 OK, 읽기만.
- [ ] 사용자가 GitHub 시크릿 `CALBRIDGE_KEYSTORE` 넣기 → workflow_dispatch로 다시 빌드 → 릴리스 주소 확인
- [ ] 실제 S26에 설치 후 `ai_phone_cal`에 줄이 생기는지, 삼성 캘린더 type 이름 확인
- [x] 2단계 나머지 (v0.4.0): 기억 키우기, 아침 브리핑 알림, 먼저 제안
- [x] 3단계 (v0.5.0): PC 일꾼 — 빈자리 지켜보기·대신 하기·허락·결과 확인
- [x] **v0.6.0 (2026-11-20): 쿨메신저 연동** — 표 `ai_cool`(user_id+id 기본키, kind/text/due/time/sender/recv/fav/done/done_src(pc|app)/gone, RLS 주인, realtime). 일꾼 `coolSync()` 20초마다: items.json·done.json 읽기 → 체크는 `%LOCALAPPDATA%AI비서일꾼쿨메신저-맞춤.json`의 지난 값(base)과 비교해 바뀐 쪽을 따름(둘 다면 앱) → 앱 체크는 done.json에 원자적 쓰기. 사라진 항목은 gone=true. **upsert 줄은 칸을 모두 같게**(supabase-js가 빠진 칸을 null로 채움). 쿨메신저 비서 window.ps1 v0.2.4가 done.json 바뀌면 다시 읽음(school 저장소). 앱: 📅 탭 아래 📨 쿨메신저, AI 문맥 [쿨메신저]·[아침 브리핑], actions done_cool / set_brief(time, mode on|off, 서버 다시 읽어 확인), 서버 브리핑에 쿨메신저 마감. 시험: `AIW_TEST` json에 `{home, coolDir, cool:[], tasks:[]}`.
  - 사용자 답(정리.md 5번): 학생 이름 올려도 됨 / 체크 양방향 / 일꾼은 학교·집 둘 다 / 브리핑 시각은 대화로 정함 / 예약은 코레일·네이버 예약·고속·시외버스 순.
- [x] v0.6.1: 숨어서 자동 켜기 — `autostart.ps1`(-Install: 시작프로그램 바로가기 `AI 비서 PC 일꾼.lnk` → powershell -WindowStyle Hidden, 쿨메신저 비서와 같은 방식 / -Uninstall: 바로가기 지우고 켜짐.json의 node pid 종료 / 없음: `node worker.js --hidden`을 돌리고 꺼지면 60초 뒤 다시, 종료코드 0·3(연결 필요)·4(이미 켜짐)면 멈춤). worker `--hidden`: 글은 `일꾼-기록.txt`로, 입력 안 물음, 브라우저는 일이 올 때만. 한 PC에 하나: `켜짐.json`{pid,t} 30초마다 갱신, 90초 넘으면 죽은 걸로 봄. bat 2개(`PC-켤때-자동켜기.bat`, `자동켜기-끄기.bat`)는 autostart.ps1만 부름. ps1은 UTF-8 BOM.
- [ ] 학교 PC에서 진짜 시험(쿨메신저 비서 v0.2.4 + 일꾼 v0.6.1, 자동 켜기 포함)
- [ ] 다음: 예약 사이트 맞추기 — 코레일 → 네이버 예약 → 고속·시외버스
- [ ] 4단계: 쇼핑(네이버 쇼핑 검색 API 최저가)·예약 사이트별 다듬기

> 사용자용 정리 문서: `정리.md`(같은 내용 클로드 문서 https://claude.ai/artifact/TvFw971mrsqkGpoukKC3dB). 사용자가 답 칸을 채워 올릴 수 있음 → 작업 시작 전에 꼭 읽기.

## 고칠 때 규칙
- 버전을 올려요: `index.html`의 `VERSION`, `sw.js`의 `CACHE`, `README.md` 버전·업데이트 기록 표, 루트 `README.md` 진열장의 "열기 vX.Y.Z" 글자. 커밋 메시지 끝에도 `(X.Y.Z)`.

## 작업 기록
- 2026-11-20 · PC Claude Code: v0.1.0 처음 만듦
- 2026-11-20 · PC Claude Code: 피클 조사 → 계획.md 작성
- 2026-11-20 · PC Claude Code: v0.2.0 1단계 — couple Supabase에 ai_ 칸, 로그인·동기화·사용량·확인 카드
- 2026-11-20 · PC Claude Code: v0.3.0 — ai-google 서버 함수, 구글 계정 여러 개·캘린더·메일
- 2026-11-20 · PC Claude Code: v0.4.0 — 아침 브리핑 알림(pg_cron+웹 푸시), 먼저 제안, 기억 키우기
- 2026-11-20 · PC Claude Code: v0.5.0 — PC 일꾼(pc-일꾼/), ai_tasks·ai_workers·ai_pair, 🖥️ 일꾼 탭
- 2026-11-20 · PC Claude Code: 정리.md(사용자용 현황·쿨메신저 가져오기 계획·정할 것) 추가
- 2026-11-20 · PC Claude Code: v0.6.0 — 쿨메신저 비서 연동(ai_cool, 양방향 체크), 대화로 브리핑 시각
- 2026-11-20 · PC Claude Code: v0.6.1 — PC 일꾼 숨어서 자동 켜기(autostart.ps1), 일꾼 하나만
- 2026-11-20 20:30 · AI 비서 짧은 주소: /toy-store/ai/ 로 들어오면 AI-비서 앱으로 넘겨 주는 페이지 추가 (v0.6.1 그대로)
- 2026-11-20 20:50 · AI 비서: 학교 관련은 쿨메신저만 남기고 학교 업무 글쓰기 버튼·AI 안내 뺌 (0.6.2)
- 2026-11-20 21:55 · AI 비서: 가입 후 메일 확인 안내(잘못된 "로그인했어요" 고침), 확인 링크 돌아올 곳을 앱으로 (0.6.3)
- 2026-11-20 22:40 · AI 비서 v0.7.0: 이름 AI berryst(설치 이름 AI 딸기), 구글 할 일·드라이브·시트·설문·유튜브·새 문서(ai-google v6 배포, ai_google_accounts.scopes 칸 추가)
- 2026-11-20 23:25 · AI 비서 v0.7.1: 딸기 로봇 아이콘(icon.svg→png), drive.file+youtube 동시 요청 막힘 → documents 허락·유튜브 따로 체크 (ai-google 재배포)
- 2026-11-20 23:45 · AI 비서: 구글 앱 게시용 개인정보처리방침 페이지 ai/privacy.html 추가
- 2026-11-21 00:20 · AI 비서 v0.7.2: 구글 계정 [🔧 범위] 버튼(login_hint로 같은 계정 다시 허락, 이름표·색 바꾸기)
- 2026-11-21 01:35 · AI 비서 v0.7.3: 구글 캘린더 목록(calendarlist.readonly) 받아 보이는 캘린더 모두 읽기, 일정 지우기에 캘린더 id 전달 (ai-google v13)
- 2026-11-21 02:00 · AI 비서: 정리.md에 오늘 한 일·삼성 캘린더 고민거리(방법 A~E)·지금 할 일 정리 (0.7.3 그대로)
- 2026-11-21 02:10 · AI 비서: 정리.md 위에 "다음에 이어서 시작하는 법" 추가 — 멈춘 곳: 계정 3개 [🔧 범위] 다시 허락 전 (0.7.3 그대로)
- 2026-11-21 17:40 · AI 비서 v0.8.0: 캘린더 다리 안드로이드 앱(v0.1.0, ai_phone_cal) — 폰의 삼성·구글·내 폰 캘린더를 일정 탭·AI·아침 브리핑에 함께, 구글과 겹치면 한 번만 (ai-google v14)
- 2026-11-22 18:40 · 캘린더 다리 앱 v0.2.0: 보낼 캘린더 고르기(체크 끄면 안 보냄) — 서명 열쇠 넣고 첫 릴리스, S26에서 15개 캘린더·46개 일정 보냄 확인
- 2026-11-22 18:55 · AI 비서 v0.9.0: 폰 캘린더에 일정 넣기·고치기·지우기(ai_phone_cmd 쪽지, 캘린더 다리 0.3.0), ⚙️ 기본 넣을 캘린더(공유용)
