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
- **메일 요약 브리핑(v0.11):** 앱 `pushMailSum()`이 sortMails 뒤 `ai_profile.mail`(at, cnt, reply[{s,f,due}], todo[…], 최대 5개, 본문 없음, 6시간에 한 번·내용 같으면 건너뜀)에 저장 → 서버 buildBrief가 36시간 안이면 "✍️ 답장할 메일 N통", "✅ 할 일 있는 메일" 줄 + 💡 답장 먼저.
- **먼저 제안:** 앱 suggestions()가 규칙으로 첫 화면 칩을 만듦(AI 안 씀). **기억 키우기:** 프롬프트 규칙 + add_memo(auto, 중복 건너뜀)/update_memo, 할 일 update_todo.
- **PC 일꾼(v0.5.0~):** `pc-일꾼/worker.js`(Node + playwright-core, 설치된 크롬/엣지를 channel로 띄움, 프로필 %LOCALAPPDATA%AI비서일꾼rowser). 표 ai_tasks(kind watch|do, status queued→running→need_ok→done/failed/stopped, need, answer yes|no, log, result{summary,verified,url}, shot=jpeg dataURL), ai_workers(30초 하트비트), ai_pair(10분 코드). 연결: 앱 pair_create(코드+이 기기 Gemini 키) → 일꾼 pair_use → generateLink(magiclink) token_hash → verifyOtp로 일꾼 전용 세션(login.json). 일꾼 알림은 ai-google notify. 위험 버튼 정규식 RISKY + AI risky면 need_ok. done은 evidence 글자가 화면에 있어야 verified. 시험: AIW_TEST=test.json (가짜 서버·가짜 AI, 로컬 html).
  - **📅 자동 예약(일꾼 v0.7.0 / 앱 v0.12.0, 2026-11-22):** 사용자 결정 — 네이버 예약·방탈출·버스, 확정 전 물어보기 + 끝까지 자동 둘 다, 열리는 시각 정각 예약. ai_tasks kind=do에 spec {book:true, what, date, auto, cal, at(ISO), retry(분), retry_until, next, tries}. 일꾼: auto면 RISKY여도 BOOK_WORDS 버튼은 바로 누르되 ALWAYS_ASK(결제·삭제·보내기)·MONEY_PAGE(결제 금액·예약금…)·AI pay=true면 허락. AI 새 action no_slot → retry면 status=queued+spec.next, 아니면 failed. 정각: 메인 루프가 at-10분에 시작 → 네이버면 NID_AUT 쿠키 없으면 로그인 요청 카드 → HEAD Date로 사이트 시계 차이 → at+0.3초에 reload. done+verified+cal이면 B.addCal: ai_phone_cal 최신 줄 write_cal(→공유용→첫 번째, can_write 있는 것)로 ai_phone_cmd add, 폰 없으면 ai_items event. SITE_TIPS(naver/kobus·t-money/korail/방탈출)를 AI에 줌. 앱: 일꾼 탭 📅 예약 맡기기 폼, bookSpec()/addBook(), AI action book_site(url,title,date,time,end_time,text,goal,mode,at,retry) [허락] 뒤 addBook. 시험: `AIW_CHROME=/opt/pw-browsers/chromium AIW_TEST=…` (TEST면 정각 10초 전에 시작).
  - **🛡️ 안전 모드(일꾼 v0.7.2 / 앱 v0.12.1, 2026-11-22):** 약관상 매크로 금지로 계정 위험 → 정각 예약은 at+3~8초 jitter·auto 강제 끄기(확정 물어봄)·열림 알림, retry 최소 30분(RETRY_MIN)·10번(RETRY_MAX), 단계 사이 1.5~3초. BLOCKED(letskorail·korail·srail)는 watch·do 모두 failed, 앱 addBook도 막음, 프롬프트에 기차 금지. 사용자에게 안전 모드/알림만/그대로 결정 카드 보냄(답 오면 반영).
  - **🚌 고속버스 빈자리 알림(일꾼 v0.8.0 / 앱 v0.13.0, 2026-11-22):** 사용자 요청 "알려주기만, 폰으로 시간대 말하면 빈자리 뜨면 알림". ai_tasks kind=watch + spec.bus{dep,arr,date,from,to,n}, every(분, 최소 2). 일꾼 runBus: KOBUS main.do 열고 page.evaluate fetch `/mrs/readRotLinInf.ajax`(노선)·`/mrs/alcnSrch.do`(배차 HTML, 버스 취소표 알리미 content.js와 같은 파서) → busPairs로 이름 비슷한 터미널 짝 최대 4개 → 시간대·remain>=n이면 notify+done. 실패 5번이면 멈춤, 출발 시간 지나면 끝. AI 안 씀. 앱: 일꾼 탭 🚌 폼, addBus(), AI action watch_bus(dep,arr,date,time,end_time,n) 허락 없이 바로. 시험: AIW_TEST json `kobus` = 가짜 서버 주소.
  - **여러 PC(일꾼 v0.7.1~):** 사용자 계획(2026-11-22) — ① 내 PC(집) 먼저 → ② 학교 PC → ③ 나중에 상시 켜 둘 미니PC에서 상시 가동(my-own- `미니PC-계획.md`). 일은 `B.claim()`(status=queued일 때만 running으로 바꾸는 조건부 update)으로 한 PC만 집어 가고 spec.by=PC 이름(cfg.name=hostname). 다시 켤 때 정리는 spec.by가 내 PC인 것만. 로그인(네이버 등)은 PC마다 따로.
  - zip(`pc-일꾼.zip`)은 worker 파일 바꾸면 다시 만들기. bat은 CRLF(.gitattributes). 학교망: node --use-system-ca.
- **📱 캘린더 다리(v0.8.0~, 앱 v0.1.0):** 안드로이드 APK `calendar-bridge/`(순수 Java, 라이브러리 없음, 패키지 app.berryst.calbridge, minSdk 26/targetSdk 34). 로그인 = AI 딸기와 같은 이메일·비밀번호로 `/auth/v1/token?grant_type=password` → refresh token만 SharedPreferences에 저장, `ai_is_owner` RPC로 주인 확인. CalendarContract Calendars+Instances(어제~60일 뒤, 취소·거절 빼고, 최대 1500개) → 표 `ai_phone_cal`(PK user_id+device, calendars jsonb[{id,name,account,type,color,visible}], events jsonb[{id,cal,date,time,end,end_date,title,loc,all_day}], synced_at, RLS 주인, realtime) 에 기기 한 줄 통째 upsert. JobScheduler: 30분 주기(persisted) + 캘린더 바뀜 트리거(TriggerContentUri, 매번 다시 걸기), BootReceiver로 다시 걸기. **읽기만**(사용자 결정 2026-11-21, 넣기는 원하면 나중에 WRITE_CALENDAR). 앱 v0.2.0~: 화면에서 캘린더마다 체크, 끈 캘린더 id는 prefs `skip_cals`에 두고 목록·일정 모두 안 보냄(서버 줄을 통째로 바꾸니 AI 딸기에서도 사라짐). **앱 v0.3.0 / AI 딸기 v0.9.0~ 쓰기:** 사용자 결정(2026-11-22) 넣기·고치기·지우기 모두, 기본 캘린더 "공유용"(⚙️에서 바꿈 → `ai_phone_cal.write_cal`, 앱 upsert는 이 칸을 안 건드림). AI 액션 add/update/delete_phone_event → [허락] → 표 `ai_phone_cmd`(device, op, cal, event_id=Events._ID(+_begin), data{date,time,end,end_date,title,loc,all_day}, status wait→run→done/fail, result; RLS 주인, realtime) → 앱 `Cmd.process`(wait→run PATCH로 한 번만, 넣은 뒤 다시 읽어 확인, 반복 일정 고치기·지우기 거절). 깨우기: 안드로이드 웹이면 `intent://run#Intent;scheme=calbridge;package=app.berryst.calbridge;end`(WakeActivity 투명), 앱 화면 켜져 있으면 5초마다, 아니면 JobScheduler 15분. calendars에 can_write, events에 rec 추가. **v0.11.0 / 다리 v0.4.0 (2026-11-22):** ⚡ 바로 깨우기 — 다리 앱에 firebase-messaging(useAndroidX=true), google-services.json 없이 `Push.java`가 ai-google `bridge_fcm`(ai_push_config.bridge_fcm jsonb, 커플 앱 Firebase uriapp-648a7의 앱 설정을 재사용 — 2026-11-22 S26에서 토큰 받기·PC 허락 후 바로 반영 확인됨 — 패키지가 달라 안 되면 Firebase 콘솔에 app.berryst.calbridge 앱을 등록하고 그 appId/apiKey로 이 칸만 바꾸면 됨, 재설치 불필요(앱 재시작 필요))로 설정 받아 FirebaseApp 수동 초기화 → 토큰을 `ai_phone_cal.fcm`에 PATCH(Sync.run 끝에서 Push.ensure). 앱 화면 ④에 push_state. 웹 `wakeBridge()`가 `gcall('phone_wake')` → 서버가 FCM_SERVICE_ACCOUNT로 data {wake:'1'} high priority → `PushService` → Cmd.process(+Sync.run). 🔁 반복 일정: 쪽지 data.scope one|all(+old_date). one=Events.CONTENT_EXCEPTION_URI/원본id에 ORIGINAL_INSTANCE_TIME=begin(event_id 뒤 _begin)으로 예외 넣기(지우기=STATUS_CANCELED, 이미 예외 줄이면 그 줄만), all=원본(ORIGINAL_ID 있으면 그것) 지우기/고치기(제목·장소·시각만, DTSTART=첫날+새 시각, DURATION=P…S, 종일↔시간 전환은 거절). 앱 허락 카드 `select[data-pscope]`, 일정 탭 ✕는 confirm 두 번(이번 것만 → 전체).
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
- 화면: 💬 대화(빠른 버튼: 오늘 브리핑·이번 주·공문 요약·기안문·가정통신문·학부모 문자·생기부 문구, 📎 파일 붙이기, 🎤 말로 하기) / 📅 일정·할 일 / 📒 기억.

## 시험한 것 / 못 한 것
- Playwright로 가짜 AI 답을 넣어 일정·할 일·기억 추가와 화면을 확인함(오류 없음).
- **실제 Gemini 키로는 아직 시험 못 함.**

## 앞으로 할 일
**전체 계획은 `계획.md`가 정본이에요(2026-11-20 사용자와 정함).** 요약: 전화 대행 빼고 피클처럼 — 일정(구글 캘린더)·메일(지메일), 구글 계정 여러 개 모두 연결·기억·먼저 제안·예약·쇼핑·빈자리 알림·대신 누르기. 실행·결제 전 반드시 허락, 실행 후 실제 상태 재확인, 남은 사용량 표시. 서버(Vercel+Supabase) 쓰기로 함. 비밀번호는 서버에 저장하지 않고 PC 일꾼이 PC 크롬 로그인 상태를 빌려 씀, 카드 번호 저장 안 함.
- [ ] 실제 키로 v0.1 써 보고 프롬프트 다듬기
- [x] 1단계 (v0.2.0): 서버 저장·동기화, 사용량 표시, 지우기 확인 카드, 저장 재확인
- [x] 사용자가 실제로 가입·로그인해서 폰↔PC 동기화 되는지 확인 (가입 후 SQL로 ai_owner·ai_items 확인)
- [x] 2단계 앞부분 (v0.3.0): 구글 계정 여러 개 연결, 캘린더 합쳐 보기·넣기·지우기, 메일 탭·요약·답장, 허락 후 실행·확인
- [x] 사용자가 구글연결-설정.md 따라 GOOGLE_CLIENT_ID/SECRET 넣기 → 앱 게시(프로덕션, 미인증) → 계정 3개 연결됨(2026-11-21)
- [x] v0.7.3: 계정 3개 [🔧 범위]로 다시 허락 → `ai_google_accounts.scopes`에 calendar.calendarlist.readonly 있는지 확인
- [x] 삼성 캘린더 읽기 = B안 캘린더 다리 (v0.8.0, 2026-11-21). 사용자: 갤럭시 S26·안드로이드 17, APK 직접 설치 OK, 읽기만.
- [ ] 사용자가 GitHub 시크릿 `CALBRIDGE_KEYSTORE` 넣기 → workflow_dispatch로 다시 빌드 → 릴리스 주소 확인
- [x] 실제 S26에 설치 후 `ai_phone_cal`에 줄이 생기는지, 삼성 캘린더 type 이름 확인
- [x] 2단계 나머지 (v0.4.0): 기억 키우기, 아침 브리핑 알림, 먼저 제안
- [x] 3단계 (v0.5.0): PC 일꾼 — 빈자리 지켜보기·대신 하기·허락·결과 확인
- [x] **v0.6.0 (2026-11-20): 쿨메신저 연동** — 표 `ai_cool`(user_id+id 기본키, kind/text/due/time/sender/recv/fav/done/done_src(pc|app)/gone, RLS 주인, realtime). 일꾼 `coolSync()` 20초마다: items.json·done.json 읽기 → 체크는 `%LOCALAPPDATA%AI비서일꾼쿨메신저-맞춤.json`의 지난 값(base)과 비교해 바뀐 쪽을 따름(둘 다면 앱) → 앱 체크는 done.json에 원자적 쓰기. 사라진 항목은 gone=true. **upsert 줄은 칸을 모두 같게**(supabase-js가 빠진 칸을 null로 채움). 쿨메신저 비서 window.ps1 v0.2.4가 done.json 바뀌면 다시 읽음(school 저장소). 앱: 📅 탭 아래 📨 쿨메신저, AI 문맥 [쿨메신저]·[아침 브리핑], actions done_cool / set_brief(time, mode on|off, 서버 다시 읽어 확인), 서버 브리핑에 쿨메신저 마감. 시험: `AIW_TEST` json에 `{home, coolDir, cool:[], tasks:[]}`.
  - 사용자 답(정리.md 5번): 학생 이름 올려도 됨 / 체크 양방향 / 일꾼은 학교·집 둘 다 / 브리핑 시각은 대화로 정함 / 예약은 코레일·네이버 예약·고속·시외버스 순.
- [x] v0.6.1: 숨어서 자동 켜기 — `autostart.ps1`(-Install: 시작프로그램 바로가기 `AI 비서 PC 일꾼.lnk` → powershell -WindowStyle Hidden, 쿨메신저 비서와 같은 방식 / -Uninstall: 바로가기 지우고 켜짐.json의 node pid 종료 / 없음: `node worker.js --hidden`을 돌리고 꺼지면 60초 뒤 다시, 종료코드 0·3(연결 필요)·4(이미 켜짐)면 멈춤). worker `--hidden`: 글은 `일꾼-기록.txt`로, 입력 안 물음, 브라우저는 일이 올 때만. 한 PC에 하나: `켜짐.json`{pid,t} 30초마다 갱신, 90초 넘으면 죽은 걸로 봄. bat 2개(`PC-켤때-자동켜기.bat`, `자동켜기-끄기.bat`)는 autostart.ps1만 부름. ps1은 UTF-8 BOM.
- [ ] 학교 PC에서 진짜 시험(쿨메신저 비서 v0.2.4 + 일꾼 v0.6.1, 자동 켜기 포함)
- [ ] 다음: 예약 사이트 맞추기 — 코레일 → 네이버 예약 → 고속·시외버스
- [ ] **🏫 학교 모드 ⇄ 🏠 일상 모드 (2026-11-27 사용자와 정함)** — 결정: 시간 따라 자동 + 손으로도 바꿈 / 다른 모드 것은 숨기지 말고 맨 아래 접기 / 폰·PC 같이 바뀜(ai_profile.settings.mode) / 📒 기억은 나누지 않음. 꼬리표 없는 옛 항목은 두 모드 모두에 보이고 지우는 건 없음.
  학교 모드 = 쌤다이어리(ssam-diary.web.app) 기능 대부분을 AI 비서식으로(겉모습·이름 베끼지 않기). 사용자가 고른 것: 월간·주간 달력, 노트·회의록·AI 요약, 교실 도구, 학급 일지, 서류철(드라이브 연결), 나이스. 위젯은 나중. 뺀 것: 동학년 공유방(주인 1명 구조), 손글씨, 종이 테마.
  학교 모드 탭: 💬 대화 / ✅ 할 일 / 📅 일정 / 📝 노트 / 🏫 학급(시간표·학급 일지·교실 도구·서류철) / 📒 기억 — 메일·일꾼은 일상 모드 탭(학교 모드에선 ⚙️나 대화로).
  - [x] v0.25.0: 스위치(#bMode)·파란색(html.school)·모드별 빠른 버튼(QUICKS)·AI 말투([지금 모드])
  - (2026-11-27 한 번에 v0.26.0으로 냄 — 아래 v0.26~0.32 항목 모두. 서류철은 drive.readonly라 '올리기'는 드라이브 새 창 → 🔍 찾아 걸기, 직접 올리기는 drive.file 허락을 따로 받아야 함(유튜브와 같이 못 받음))
  - [x] v0.26.0: 학교/일상 꼬리표(data.mode, 새 항목엔 지금 모드, 쿨메신저=늘 학교) + 분류(업무·수업준비·회의·공문행정·학생학부모·연수·개인·가족·기타, AI가 자동) + ⭐중요 + 모드별 탭 구성. 다른 모드 것은 아래 접기
  - [x] v0.27.0: 📅 월간·주간 달력(일정 탭에 목록/주간/월간, 내 일정·구글·폰·쿨메신저·마감 할 일 합쳐, 분류 색, 날짜 누르면 그날 + 바로 넣기)
  - [x] v0.28.0: 🏫 나이스 교육정보 개방 포털(무료 인증키 — 사용자가 받아야 함, 브라우저 CORS 안 되면 ai-google에 proxy). ⚙️ 학교 이름 검색 → 고르기(학교 코드 저장, 전근 땐 다시 고르기만) + 학년·반(3월 1일에 확인 물어봄). 학사일정 → 일정, 급식 → 오늘 화면·아침 브리핑, 시간표(초등 elsTimetable, 비어 있거나 틀리면 손으로 고치기·엑셀 붙여넣기, 교시 시간 설정)
  - [x] v0.29.0: 📝 노트·회의록(ai_items kind=note 추가 — 칸 추가만) + ✨ AI 요약(요약·정해진 것·할 일 → [할 일/일정으로 넣기]) + 일기. 클로바노트 연계: 공개 API 없음 → 폰 공유하기로 받기(manifest share_target을 POST+files로 넓혀 txt·docx·음성 파일도), 회의록 서식으로 노트에 저장. 음성 파일 직접 오면 Gemini 오디오(길면 나눠 보내기)
  - [x] v0.30.0: 📋 학급 일지 — 명렬표(엑셀 붙여넣기), 출결, 상담 일지, 일일 기록, 🖨️ 인쇄. 학생 이름 OK(주인만 RLS)
  - [x] v0.31.0: 🎲 교실 도구 — 타이머(TV 전체 화면), 뽑기(명렬표 연결), 자리 바꾸기, 점수판, 대진표. AI·서버 안 씀
  - [x] v0.32.0: 📁 서류철 — 구글 드라이브 "AI 딸기 서류철" 폴더(drive.file, 이미 허락 범위 있음), 파일 올리기·주소로 걸기·폴더, 노트·일정에 붙이기. 파일은 드라이브에만, 앱엔 링크
  - [x] v0.27.0: 구글 계정·폰 캘린더 학교용/일상용 나누기 → 자동 전환(평일 8:30~16:40 학교, 주말·방학 일상(나이스 학사일정으로 방학 알기), 손으로 바꾸면 다음 경계까지) + 아침 브리핑 모드별
  - [ ] **ai-google 재배포 남음** — 소스(supabase/functions/ai-google/index.ts)는 v0.27 브리핑으로 고쳤지만 배포는 아직(2026-11-27 자동 모드 권한에서 막힘, 사용자 허락 필요). 배포 전에는 옛 브리핑 그대로, 앱은 문제없음
  - [ ] 나중: PC 바탕화면 위젯(쿨메신저 비서 창 방식)
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
- 2026-11-22 19:10 · AI 비서 v0.9.1: Gemini 503 때 1·3초 뒤 다시, 그래도 안 되면 BACKUP_MODELS(gemini-flash-latest 등)로, 429도 다음 모델로
- 2026-11-22 19:15 · AI 비서 v0.9.2: AI가 새 일정을 구글 대신 폰 기본 캘린더(공유용)에 넣게 프롬프트 우선순위 바꿈 (구글은 콕 집어 말할 때만)
- 2026-11-22 19:20 · AI 비서 v0.9.3: body overflow hidden + .page/#msgs min-height:0 로 입력창 고정, textarea min-height 68px(두 줄)
- 2026-11-22 19:25 · AI 비서 v0.9.4: 빠른 버튼에서 🍱 저녁 메뉴 뺌
- 2026-11-22 19:50 · AI 비서 v0.10.0: 메일 자동 정리·요약(MCAT 5종, ls mailcls/mailsum) + 지메일 라벨 AI딸기/…·광고 보관(gmail.modify, mail_tidy, ai-google v15)
- 2026-11-22 19:55 · AI 비서 v0.10.1: 앱 높이를 visualViewport.height(--appH)로 맞춰 폰 입력창 잘림 고침, header에 safe-area-inset-top. 대화 action tidy_mail → tidyMailNow()(sortMails+tidyGmail, 지우지 않음), 프롬프트에 [지메일 정리] 허락 계정
- 2026-11-22 19:55 · AI 비서 v0.12.0 / 일꾼 v0.7.0: 📅 자동 예약 — 확정 전 물어보기·끝까지 자동(돈 드는 건 항상 허락), 정각 예약(사이트 시계), 자리 없으면 다시, 예약되면 폰 캘린더
- 2026-11-22 19:50 · AI 비서 v0.11.0 + 캘린더 다리 v0.4.0: ⚡ FCM 바로 깨우기(ai_phone_cal.fcm, ai_push_config.bridge_fcm, phone_wake·bridge_fcm), ☀️ 브리핑 메일 요약(ai_profile.mail), 🔁 반복 일정 이번 것만/전체 (ai-google v16)
- 2026-11-22 20:05 · PC 일꾼 v0.7.1: 여러 PC에 깔아도 한 일은 한 PC만(claim), 설치 순서 계획 기록(내 PC→학교 PC→미니PC 상시)
- 2026-11-22 20:10 · AI 비서 v0.12.1 / 일꾼 v0.7.2: 🛡️ 안전 모드 — 정각 예약 몇 초 늦게+확정 물어봄, 다시 보기 30분·10번, 코레일·SRT 막기
- 2026-11-22 20:05 · AI 비서 v0.12.2: @media(min-width:1000px) main max-width 없앰+좌우 28px, 말풍선 72%, #taskList 그리드(minmax 440px)
- 2026-11-22 20:10 · AI 비서 v0.12.3: Gemini 키를 ai_profile.settings.gkey에도 저장(RLS 주인만) → pullProfile에서 이 기기에 없으면 받아 씀, pushProfile은 키 없는 기기가 서버 키를 지우지 않게 먼저 읽음. 키 안내 토스트는 5초 뒤·하루 한 번(ls keyHint)
- 2026-11-22 21:13 · 사용자 확인: 캘린더 다리 0.4.0 바로 깨우기 ✅, PC 허락 → 폰 캘린더 바로 들어감
- 2026-11-22 21:25 · AI 비서 v0.13.0 / 일꾼 v0.8.0: 🚌 고속버스 빈자리 알림(kobus 배차 조회, AI 안 씀, 폰 알림만), 대화 watch_bus
- 2026-11-22 21:30 · AI 비서 v0.13.1: 프롬프트 — watch_bus는 거절 금지(기차 금지 규칙과 무관) 명시, 기차 금지 문장을 '기차만'으로, 날짜 없으면 [지금] 기준 오늘/내일
- 2026-11-22 21:40 · AI 비서 v0.13.2: busFrom(a, 사용자 말) — Gemini가 watch_bus의 dep/arr/date를 비워 보내서, title·text·사용자 말에서 'A에서/→ B', 'N시 M분 전/부터'(오후·저녁·밤이면 +12), 내일/모레, N자리 파싱. 날짜 없으면 시각이 지났으면 내일. 프롬프트에 watch_bus 예시 JSON과 '허락 없이 맡겨짐'
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.13.3 — 허락이 필요 없는 일(할 일·일정·기억 넣기)인데 "허락해 주세요"라고 말하던 것 고침(프롬프트 + 허락 카드 없으면 그 문장 빼기)
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.14.0 — ✅ 할 일 탭(pTodo, renderTodo: S.todos+G.tasks 디데이 묶음, renderPlan 끝에서 부름, 클릭은 pPlan 처리기 공유), 일정 입력칸 맨 위로 (사용자 요청)
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.14.1 — 탭 순서 할 일↔일정 바꿈 (사용자 요청)
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.15.0 — 쿨메신저를 할 일 탭으로(renderTodo에 coolOpen kind=todo 섞기 src='cool', data-cool 체크는 coolClick, 거르기 tdF ls 'tdF', renderCool은 note·remember만 접기 coolMemoOpen). 사용자: 일단 넣어 보고 고치기로 함
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.15.1 — 쿨메신저 kind 뜻 바꿈(todo=마감 할 일, note=일정, remember=알아 둘 것; 값은 그대로). coolEvents()로 note+due를 allEvents에 섞음(id c_…, e.cool, ✓=data-cool-hide→setCoolDone). 날짜 없는 note는 할 일 탭 아래. ⚠️ 서버 buildBrief는 아직 kind=todo만 봄(쿨메신저 일정은 아침 브리핑에 안 나옴) — 다음에 ai-google 배포할 때 note도 '오늘 일정'에 넣기
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.16.0 — 체크리스트 고치기(tdEdit='me:id'|'cool:id', data-td-edit 제목·✏️ → 이름+date 입력 줄, saveTdEdit). 내 할 일은 put('todo'), 쿨메신저 할 일은 ai_cool text·due만 update(+select 확인). 일꾼은 PC 쪽 내용(sig)이 바뀔 때만 다시 올리니 앱에서 고친 건 유지되지만, 쿨메신저 비서 창/items.json에는 안 들어감. 구글 할 일은 아직 못 고침
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.16.1 — coolLive()에서 kind=todo && !due 를 remember로 바꿔 보여 줌(사용자 결정: 마감 없는 할 일 = 알아 둘 것). 쿨메신저 비서 v0.2.6 프롬프트도 같이, 학교 PC items.json의 due 없는 todo 9개도 remember로 바꿈
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.17.0 — 할 일 탭 입력에 #tdKind(todo/event/remember, ls 'tdKind' 기억). event→put('event'), remember→S.todos에 kind:'remember'(서버 ai_items kind는 그대로 todo, data.kind만) → renderNotes()가 #noteList에 그림, 체크리스트·끝낸 것·첫 화면 할 일 수에서는 뺌, AI 프롬프트엔 [알아 둘 것] 표시. 서버 buildBrief는 due 없는 건 안 보니 영향 없음
- 2026-11-23 · 학교 PC Claude Code: AI 비서 v0.18.0 / 일꾼 v0.9.0 / 쿨메신저 비서 v0.2.7 — 직접 넣은 항목 양방향. 쿨메신저 비서 창 ➕ → %LOCALAPPDATA%/CoolAI/my.json(id my-…, 엔진은 안 건드려 items.json 덮어쓰기 경쟁 없음). 앱 #tdCool 체크(ls tdCool) → addCoolItem()이 ai_cool에 app-… 줄 insert(event→note) → 일꾼 coolSync가 my.json에 더함(st.pulled). 직접 항목은 PC sig 그대로인데 서버 kind/text/due/time이 다르면 my.json에 반영(앱에서 고치기). 창에서 지우면 파일에 없음 → gone. coolAll이 모든 칸 select. 시험: AIW_TEST 두 번(넣기·고치기·지우기) 통과
- 2026-11-23 · 학교 PC Claude Code: PC 일꾼 v0.9.1 — autostart.ps1 바로가기를 conhost.exe --headless powershell …로(윈도우 11 기본 터미널이 -WindowStyle Hidden을 무시해 작업 표시줄에 빈 창이 남고 닫으면 꺼지던 것). 학교 PC는 -Install 다시 함
- 2026-11-24 · 학교 PC Claude Code: AI 비서 v0.18.1 — 아침 브리핑이 저절로 꺼지던 버그. pushProfile()이 이 기기 ls 'brief'(기본 on:false·옛 값)를 늘 올려 덮어썼음(⚙️ 저장·새 기기 첫 로그인). 이제 서버 settings를 읽어 합치고 patch.brief 있을 때만 brief 변경, openSet에서 pullProfile 후 briefAtOpen과 다를 때만 올림
- 2026-11-24 · 학교 PC Claude Code: AI 비서 v0.19.0 — renderChat이 ts 기준 어제까지 대화를 접음(showOld, .oldbtn data-old, .daysep), welcome 카드는 오늘 대화 바로 위. 펼칠 때 welcome으로 scrollIntoView. 데이터·AI에 보내는 최근 16개는 그대로. Playwright 시험 통과
- 2026-11-24 · 학교 PC Claude Code: AI 비서 v0.20.0 — #bBriefPop(pChat 오른쪽 위, .welcome이 msgs 밖이면 show; msgs scroll·renderChat 뒤 briefPopCheck) → #mBrief 모달에 welcomeHTML(). 모달 안 칩·배너는 #briefPop 클릭 위임. Playwright 시험 통과
- 2026-11-24 · 학교 PC Claude Code: AI 비서 v0.21.0 — 대화 보관(사용자 결정): CHAT_KEEP_DAYS=30(서버), CHAT_DEVICE_DAYS=7(기기). pruneChat: 30일↑ dirty deleted, 7일↑는 owner이고 dirty 없을 때만 기기에서 덜어 냄(비로그인은 30일까지 기기 유지). pruneServer 하루 1번(ls chatPruned): serverChats()로 30일↑ 찾아 upsert {data:{},deleted:true}, deleted 표시도 30일 지나면 hard delete(RLS가 막으면 조용히 넘어감). 지난 대화 펼치면 loadOlder()로 서버 대화(olderChat, 기기 저장 안 함) 함께 표시. Playwright 시험 통과(실서버 시험은 안 함)
- 2026-11-24 · 학교 PC Claude Code: 사용자 확인 — 캘린더 다리 설치·폰 일정, 구글 범위 다시 허락, 폰↔PC 동기화 모두 잘 됨. 아침 브리핑(0.18.1 고침)은 다음 날 아침 확인 남음. 피클 비교 후 다음 후보: 날씨 브리핑 → 한글·워드 파일 → 쇼핑 → 반복 일
- 2026-11-26 · 클라우드 Claude: AI 비서 v0.23.0~0.24.0 — ⏰ 반복 일에 from/until(기간, 끝나면 앱이 지움)·remind(AI 없이 글 알림)·done_today, TIME_WORD 기본 시각(아침 07:00·점심 12:00·저녁 17:30), time 여러 개면 나눠 만들기, 같은 것 두 번 안 만들기, 사용자 말(_said)에서 "N일간"·알림 채우기. saveRoutines 확인은 canon() 비교(jsonb가 칸 순서를 바꿔서 늘 실패로 뜨던 것). 처리 못 한 action만 있으면 reply를 ⚠️로 바꿈. renderChat은 busy면 생각 중 표시 유지, Gemini fetch 60초 제한. 알림 badge.png(투명 배경 흰 그림). **서버 cron_brief가 remind 반복 일을 5분마다 보고 web-push + 대화 줄 남김(rt_last 공유, ai-google 재배포)** → 일꾼이 꺼져 있어도 감. 일꾼 v0.10.1도 from/until·remind 지킴(학교 PC 일꾼은 아직 0.9.1이라 반복 일 자체를 모름 — 새 zip으로 바꿔야 함)
- 2026-11-27 · PC Claude Code: AI 비서 v0.25.0 — 🏫⇄🏠 모드 1단계. ls/settings `mode`={m:school|life, at}(나중 at이 이김, pullProfile에서 적용, 앱으로 돌아올 때 visibilitychange로 30초에 한 번 pullProfile). applyMode(): html.school 파란 변수, theme-color, 입력칸 안내, QUICKS[school|life]. systemPrompt에 [지금 모드] 문단(학교: 쿨메신저 먼저·공문 요약·기안문 서식 / 일상: 쿨메신저는 물을 때나 오늘·내일 마감만). 폰 폭 430px 이하는 제목을 🍓만. Playwright(360px) 시험 통과, 실서버 기기 간 동기화는 사용자 확인 남음
- 2026-11-27 · PC Claude Code: 학교 모드 계획 고침 — 쌤다이어리 기능(달력·나이스·노트/회의록·학급 일지·교실 도구·서류철) 순서 정함, 클로바노트는 공유하기로 연계
- 2026-11-27 · PC Claude Code: AI 비서 v0.26.0 — 🏫 학교 모드 큰 업데이트. 새 파일 `school.js`(index.html 뒤에 읽힘, 전역 공유 — 새 전역 이름은 index와 겹치지 않게, index가 window.xxx로 부르는 건 꼭 function 선언). ai_items kind에 note·class 추가(check 제약만 넓힘). S.notes(note: type note|meeting|diary, title, body, date, sum{summary,decisions,todos,events,added}), S.cls(class: t=roster(id cls_roster)|tt(cls_tt: periods, week{1..5:[]}, prefer neis|me)|att(att_날짜: marks{번호:{k,why,memo}})|counsel|log(log_날짜)|file{title,url,folder,src}). put()이 새 event/todo에 mode(ls mode)·tagNew(cat 규칙 CAT_RULES, "!"·"(중요)"→star). renderTodo/renderPlan: otherMode는 foldH로 접기, markH(⭐·분류 칩, capture 클릭). 학교 모드 탭: 노트·학급 / 일상: 메일·일꾼(scMode). 📆 planView 목록/주간/월간(scCal, calData=allEvents+마감 할 일). 나이스: CORS 열림, ⚙️ 🏫 칸(키·학교 찾기·학년·반, settings.school 동기화), neisRefresh 하루 1번(학사일정 AY 3/1~2/28 학년 필터·토요휴업일 빼기, 급식 이번·다음 주 중식, elsTimetable), neisEvents()를 allEvents에. 키 없으면 5줄만. 🎙️ 녹음: MediaRecorder 5분 조각 → toWav(16kHz mono) → gemini inline audio/wav(받아쓰기 {text}) → 노트에 붙임 → 끝나면 summarize. 20MB 넘는 파일은 Files API(multipart, CORS OK) → file_data. wakeLock, #recPill. gemini()에 opt.timeout 추가. 공유: manifest share_target POST multipart(files f) → sw.js가 ai-share 캐시 → ?shared=1 → takeShare(녹음=회의록 받아쓰기, 긴 글·txt=회의록+요약, 사진·PDF=대화 첨부). manifest shortcuts ?rec=1·?note=1. scPrompt()가 [오늘 시간표]·[급식]·[학사일정]·[오늘 출결]·[최근 노트]. Playwright(가짜 마이크·가짜 AI·진짜 나이스) 시험 통과. 실제 Gemini 오디오 받아쓰기는 사용자 키로 확인 남음
- 2026-11-27 · PC Claude Code: AI 비서 v0.27.0 — 🏫⇄🏠 자동 전환·계정 나누기. school.js 끝에 새 구역: ls/settings `use`{'g:메일소문자'|'p:폰캘린더id': school|life, 없으면 둘 다}, `modeAuto`{on(기본 true),start 08:30,end 16:40}. index `effMode()` = 손으로 바꾼 at이 autoState().since(마지막 경계)보다 나중이면 손 값, 아니면 자동 값; isSchool()·put() 꼬리표가 이걸 씀. offSet(): NC.sched off(휴업일·**공휴일** 새로 포함)+이름(방학·대체공휴·재량휴업)+방학식/종업식 다음 날~개학 전날(없으면 2월 말). modeTick 1분마다·visibilitychange. otherMode가 g·p·구글 할 일도 useOf로. scPull(settings)을 pullProfile이 부름. pushSdays(): settings.sdays{off, days{날짜:{m 급식, t 시간표}}, at} 바뀔 때만. ⚙️ 🏫⇄🏠 모드 나누기(details #maBox). brief.time_off(쉬는 날 시각, #bTime2). scPrompt 첫 줄 [오늘] 학교 가는 날/쉬는 날. neisRefresh가 실패하면 같은 학교의 옛 sched·meal·tt 유지(전엔 빈 것으로 덮였음). **school.js의 '시작' 구역은 꼭 파일 맨 끝**(const가 위에서 먼저 쓰이면 TDZ 오류). 서버 buildBrief: schoolDayOf(settings,d)로 🏫/🏠 제목, 지금 모드 일정 먼저·다른 모드는 '🏠 퇴근 뒤'/'🏫 학교 일정도' 한 줄, 📚 시간표·🍱 급식(sdays.days), 쿨메신저 note(오늘)도 일정에, 쉬는 날엔 학교 할 일·쿨메신저 지난 것 빼고 내일 학교 마감만, 학교용 계정 안 읽은 메일 뺌, cron은 쉬는 날 time_off. Playwright(가짜 시계·가짜 학사일정) 18개 통과, deno check 통과. 서버 배포는 아직
- 2026-11-27 · 클라우드 Claude: AI 비서 v0.27.1 — update_routine(id, until/time/title/text/mode) + updRoutine(), [반복 일] 문맥에 ~until·[알림] 표시, actions 없이 '수정해 둘게요' 류면 ⚠️ 덧붙임, .sheet input width:100% 때문에 .rt 체크칸이 넓어지던 것 고침, '마지막'→'최근 알림'. 사용자 약 알림 3개는 SQL로 until(아침·점심 11-28, 저녁 11-27)·remind 넣음
