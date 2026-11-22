package app.berryst.calbridge;

import android.content.ContentUris;
import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;
import android.provider.CalendarContract.Events;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/**
 * AI 딸기가 서버(표 ai_phone_cmd)에 남긴 "쪽지"를 읽어서 폰 캘린더에 넣기·고치기·지우기를 해요.
 *  - 쪽지는 AI 딸기에서 사용자가 [허락]을 누른 것만 생겨요.
 *  - 한 쪽지는 한 번만 처리해요(wait → run 으로 먼저 바꾼 쪽만 처리).
 *  - 반복 일정은 AI 딸기에서 고른 대로 "이번 것만" 또는 "반복 전체"를 바꿔요 (v0.4.0).
 */
public class Cmd {
    static final long HOUR = 3600_000L, DAY = 24 * HOUR;

    /** 기다리는 쪽지를 모두 처리해요. 처리한 개수를 돌려줘요. (실패해도 보내기는 계속되게 예외를 밖으로 안 던져요) */
    static synchronized int process(Context c) {
        if (!Api.loggedIn(c) || !Sync.hasWrite(c)) return 0;
        int n = 0;
        try {
            String dev = Uri.encode(Sync.device(c));
            JSONArray list = new JSONArray(Api.http("GET", "/rest/v1/ai_phone_cmd?select=*&status=eq.wait&device=eq." + dev + "&order=created_at.asc&limit=20", Api.token(c), null, null));
            for (int i = 0; i < list.length(); i++) {
                JSONObject cmd = list.getJSONObject(i);
                String id = cmd.getString("id");
                // 먼저 "하는 중"으로 바꿔요. 이미 다른 쪽(다른 깨움)이 가져갔으면 건너뛰어요
                JSONArray took = new JSONArray(Api.http("PATCH", "/rest/v1/ai_phone_cmd?id=eq." + id + "&status=eq.wait", Api.token(c),
                    new JSONObject().put("status", "run").toString(), "return=representation"));
                if (took.length() == 0) continue;
                String status = "done", result;
                try { result = run(c, cmd); }
                catch (Exception e) { status = "fail"; result = "⚠️ " + e.getMessage(); }
                Api.http("PATCH", "/rest/v1/ai_phone_cmd?id=eq." + id, Api.token(c),
                    new JSONObject().put("status", status).put("result", result).put("done_at", Sync.iso(System.currentTimeMillis())).toString(), "return=minimal");
                n++;
            }
        } catch (Exception e) {
            Api.prefs(c).edit().putString("cmd_err", "⚠️ 쪽지 처리: " + e.getMessage()).apply();
            return n;
        }
        Api.prefs(c).edit().remove("cmd_err").apply();
        if (n > 0) Api.prefs(c).edit().putLong("cmd_last", System.currentTimeMillis()).putInt("cmd_count", Api.prefs(c).getInt("cmd_count", 0) + n).apply();
        return n;
    }

    /** 쪽지 하나 실행. 성공하면 보여 줄 한 줄을 돌려주고, 안 되면 예외. 넣거나 고친 뒤 다시 읽어서 확인해요. */
    static String run(Context c, JSONObject cmd) throws Exception {
        String op = cmd.getString("op");
        JSONObject d = cmd.optJSONObject("data");
        if (d == null) d = new JSONObject();
        android.content.ContentResolver cr = c.getContentResolver();

        if (op.equals("add")) {
            long cal = Long.parseLong(cmd.optString("cal", "0"));
            String[] ci = calInfo(c, cal);
            if (ci == null) throw new Exception("넣을 캘린더를 폰에서 못 찾았어요");
            if (Integer.parseInt(ci[1]) < CalendarContract.Calendars.CAL_ACCESS_CONTRIBUTOR) throw new Exception("[" + ci[0] + "] 캘린더는 넣기가 막혀 있어요");
            ContentValues v = values(d, null);
            v.put(Events.CALENDAR_ID, cal);
            Uri u = cr.insert(Events.CONTENT_URI, v);
            if (u == null) throw new Exception("폰 캘린더가 넣기를 거절했어요");
            long id = ContentUris.parseId(u);
            if (!exists(c, id)) throw new Exception("넣었는데 다시 읽어 보니 없어요");
            return "✅ [" + ci[0] + "]에 넣었어요 (확인됨)";
        }

        String[] idp = cmd.optString("event_id", "0").split("_");
        long id = Long.parseLong(idp[0]);
        long begin = idp.length > 1 ? Long.parseLong(idp[1]) : 0; // 반복 일정에서 "이번 것"의 시작 시각
        Ev ev = eventInfo(c, id);
        if (ev == null) throw new Exception("그 일정을 폰에서 못 찾았어요(이미 지워졌을 수 있어요)");
        if (!op.equals("delete") && !op.equals("update")) throw new Exception("모르는 쪽지예요: " + op);

        // 🔁 반복 일정 (v0.4.0): "이번 것만(one)" 또는 "반복 전체(all)"
        if (ev.repeating()) return repeat(c, op, d, ev, begin);

        if (op.equals("delete")) {
            int k = cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null);
            if (k < 1 || exists(c, id)) throw new Exception("지우기가 안 됐어요");
            return "🗑️ 지웠어요 (확인됨): " + ev.title;
        }
        int k = cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, id), values(d, ev), null, null);
        if (k < 1) throw new Exception("고치기가 안 됐어요");
        Ev after = eventInfo(c, id);
        String want = d.optString("title", "").trim();
        if (after == null || (!want.isEmpty() && !want.equals(after.title))) throw new Exception("고쳤는데 다시 읽어 보니 그대로예요");
        return "✏️ 고쳤어요 (확인됨): " + after.title;
    }

    /**
     * 반복 일정 고치기·지우기.
     *  - one(이번 것만): 그날 하나만 "예외"로 만들어요. 지우기 = 그날만 취소, 고치기 = 그날만 다른 시간·제목
     *    (이미 한 번 따로 고친 날이면 그 하나만 바로 고쳐요)
     *  - all(반복 전체): 반복의 "원본"을 바꿔요. 지우기 = 반복 전체 지우기, 고치기 = 제목·장소·시각만 (날짜·반복 규칙은 그대로)
     */
    static String repeat(Context c, String op, JSONObject d, Ev ev, long begin) throws Exception {
        android.content.ContentResolver cr = c.getContentResolver();
        String scope = d.optString("scope", "one");
        boolean isException = ev.rrule.isEmpty() && ev.origId > 0; // 예전에 그날만 따로 고친 일정
        long master = isException ? ev.origId : ev.id;

        if (scope.equals("all")) {
            Ev m = eventInfo(c, master);
            if (m == null) throw new Exception("반복 일정의 원본을 폰에서 못 찾았어요");
            if (op.equals("delete")) {
                int k = cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, master), null, null);
                if (k < 1 || exists(c, master)) throw new Exception("반복 전체 지우기가 안 됐어요");
                return "🗑️ 반복 일정 전체를 지웠어요 (확인됨): " + m.title;
            }
            ContentValues v = new ContentValues();
            String title = d.optString("title", "").trim();
            if (!title.isEmpty()) v.put(Events.TITLE, title);
            if (d.has("loc")) v.put(Events.EVENT_LOCATION, d.optString("loc", ""));
            String time = d.optString("time", ""), end = d.optString("end", "");
            boolean wantAllDay = time.isEmpty();
            if (wantAllDay != m.allDay) throw new Exception("반복 일정 전체를 '종일 ↔ 시간 있는 일정'으로 바꾸는 건 폰 삼성 캘린더에서 직접 해 주세요");
            if (!m.allDay) {
                // 첫 번째 날짜는 그대로 두고 시각만 바꿔요. 반복 일정은 끝 시각 대신 '길이(DURATION)'를 써요
                TimeZone tz = m.tz.isEmpty() ? TimeZone.getDefault() : TimeZone.getTimeZone(m.tz);
                SimpleDateFormat df = fmt("yyyy-MM-dd", tz), f = fmt("yyyy-MM-dd HH:mm", tz);
                String day = df.format(m.start);
                long s = f.parse(day + " " + time).getTime();
                long len = end.isEmpty() ? m.length() : f.parse(day + " " + end).getTime() - s;
                if (len <= 0) len = m.length() > 0 ? m.length() : HOUR;
                v.put(Events.DTSTART, s);
                v.put(Events.DURATION, "P" + (len / 1000) + "S");
            }
            if (v.size() == 0) throw new Exception("바꿀 내용이 없어요");
            int k = cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, master), v, null, null);
            if (k < 1) throw new Exception("반복 전체 고치기가 안 됐어요");
            Ev after = eventInfo(c, master);
            if (after == null || (!title.isEmpty() && !title.equals(after.title))) throw new Exception("고쳤는데 다시 읽어 보니 그대로예요");
            String moved = d.optString("date", "").isEmpty() || d.optString("date", "").equals(d.optString("old_date", "")) ? "" : " (반복이라 날짜는 그대로 두었어요)";
            return "✏️ 반복 일정 전체를 고쳤어요 (확인됨): " + after.title + moved;
        }

        // ── 이번 것만 ──
        if (isException) { // 이미 따로 떨어진 하루짜리 → 그 하나만 고치거나 취소
            if (op.equals("delete")) {
                ContentValues v = new ContentValues(); v.put(Events.STATUS, Events.STATUS_CANCELED);
                cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, ev.id), v, null, null);
                Ev after = eventInfo(c, ev.id);
                if (after != null && after.status != Events.STATUS_CANCELED) throw new Exception("이번 것 지우기가 안 됐어요");
                return "🗑️ 반복 일정 중 이번 것만 지웠어요 (확인됨): " + ev.title;
            }
            int k = cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, ev.id), values(d, ev), null, null);
            Ev after = eventInfo(c, ev.id);
            String want = d.optString("title", "").trim();
            if (k < 1 || after == null || (!want.isEmpty() && !want.equals(after.title))) throw new Exception("고쳤는데 다시 읽어 보니 그대로예요");
            return "✏️ 반복 일정 중 이번 것만 고쳤어요 (확인됨): " + after.title;
        }
        if (begin <= 0) throw new Exception("어느 날짜의 일정인지 몰라요. AI 딸기에서 일정을 새로 받은 뒤 다시 해 주세요");
        ContentValues v = op.equals("delete") ? new ContentValues() : values(d, ev);
        v.put(Events.ORIGINAL_INSTANCE_TIME, begin);
        if (op.equals("delete")) v.put(Events.STATUS, Events.STATUS_CANCELED);
        Uri u = cr.insert(ContentUris.withAppendedId(Events.CONTENT_EXCEPTION_URI, master), v);
        if (u == null) throw new Exception("폰 캘린더가 거절했어요");
        if (op.equals("delete")) {
            if (instanceAlive(c, master, begin)) throw new Exception("지웠는데 다시 읽어 보니 그대로예요");
            return "🗑️ 반복 일정 중 이번 것만 지웠어요 (확인됨): " + ev.title;
        }
        Ev after = eventInfo(c, ContentUris.parseId(u));
        String want = d.optString("title", "").trim();
        if (after == null || (!want.isEmpty() && !want.equals(after.title))) throw new Exception("고쳤는데 다시 읽어 보니 그대로예요");
        return "✏️ 반복 일정 중 이번 것만 고쳤어요 (확인됨): " + after.title;
    }

    /** 반복 일정의 그날(begin)이 아직 살아 있는지 (취소되지 않은 채로) */
    static boolean instanceAlive(Context c, long eventId, long begin) {
        Uri.Builder ub = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(ub, begin - DAY); ContentUris.appendId(ub, begin + DAY);
        try (Cursor q = c.getContentResolver().query(ub.build(), new String[]{ CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.BEGIN, CalendarContract.Instances.STATUS }, null, null, null)) {
            while (q != null && q.moveToNext())
                if (q.getLong(0) == eventId && q.getLong(1) == begin && q.getInt(2) != Events.STATUS_CANCELED) return true;
        }
        return false;
    }

    /**
     * 날짜·시간을 폰 캘린더 값으로 바꿔요.
     *  - 시간이 없으면 종일 일정(세계 표준시 자정 기준, 안드로이드 규칙)
     *  - 끝 시간이 없으면 1시간짜리
     */
    static ContentValues values(JSONObject d, Ev old) throws Exception {
        ContentValues v = new ContentValues();
        String title = d.optString("title", "").trim();
        if (!title.isEmpty()) v.put(Events.TITLE, title);
        else if (old == null) v.put(Events.TITLE, "(제목 없음)");
        if (d.has("loc")) v.put(Events.EVENT_LOCATION, d.optString("loc", ""));
        String date = d.optString("date", "");
        if (date.isEmpty()) {
            if (old == null) throw new Exception("날짜가 없어요");
            return v; // 고치기에서 날짜를 안 바꾸면 시간도 그대로
        }
        String time = d.optString("time", ""), end = d.optString("end", ""), endDate = d.optString("end_date", "");
        if (endDate.isEmpty()) endDate = date;
        if (time.isEmpty() || d.optBoolean("all_day", false)) {
            SimpleDateFormat f = fmt("yyyy-MM-dd", TimeZone.getTimeZone("UTC"));
            long s = f.parse(date).getTime(), e = f.parse(endDate).getTime() + DAY;
            if (e <= s) e = s + DAY;
            v.put(Events.ALL_DAY, 1); v.put(Events.DTSTART, s); v.put(Events.DTEND, e); v.put(Events.EVENT_TIMEZONE, "UTC");
        } else {
            TimeZone tz = TimeZone.getDefault();
            SimpleDateFormat f = fmt("yyyy-MM-dd HH:mm", tz);
            long s = f.parse(date + " " + time).getTime();
            long e = end.isEmpty() ? s + HOUR : f.parse(endDate + " " + end).getTime();
            if (e <= s) e = s + HOUR;
            v.put(Events.ALL_DAY, 0); v.put(Events.DTSTART, s); v.put(Events.DTEND, e); v.put(Events.EVENT_TIMEZONE, tz.getID());
        }
        v.putNull(Events.DURATION); // 반복 아닌 일정은 끝 시각(DTEND)만 써요
        return v;
    }

    /** {캘린더 이름, 권한 수준} */
    static String[] calInfo(Context c, long cal) {
        try (Cursor q = c.getContentResolver().query(ContentUris.withAppendedId(CalendarContract.Calendars.CONTENT_URI, cal),
                new String[]{ CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.CALENDAR_ACCESS_LEVEL }, null, null, null)) {
            if (q != null && q.moveToFirst()) return new String[]{ Sync.nz(q.getString(0)), String.valueOf(q.getInt(1)) };
        }
        return null;
    }

    /** 폰 캘린더의 일정 한 줄 */
    static class Ev {
        long id, origId, start, dtend; String title = "", rrule = "", duration = "", tz = ""; boolean allDay; int status;
        boolean repeating() { return !rrule.isEmpty() || origId > 0; }
        /** 한 번의 길이(밀리초): DURATION(P3600S, PT1H 같은 글자) 또는 끝-시작 */
        long length() {
            if (dtend > start) return dtend - start;
            java.util.regex.Matcher m = java.util.regex.Pattern.compile("P(?:(\\d+)W)?(?:(\\d+)D)?(?:T?(?:(\\d+)H)?(?:(\\d+)M)?(?:(\\d+)S)?)?").matcher(duration);
            if (!m.matches()) return HOUR;
            long[] u = { 7 * DAY, DAY, HOUR, 60_000L, 1000L }; long t = 0;
            for (int i = 0; i < 5; i++) if (m.group(i + 1) != null) t += Long.parseLong(m.group(i + 1)) * u[i];
            return t > 0 ? t : HOUR;
        }
    }

    /** 일정 하나 읽기. 없거나 지워진 일정이면 null */
    static Ev eventInfo(Context c, long id) {
        try (Cursor q = c.getContentResolver().query(ContentUris.withAppendedId(Events.CONTENT_URI, id),
                new String[]{ Events.TITLE, Events.RRULE, Events.ORIGINAL_ID, Events.DELETED, Events.DTSTART, Events.DTEND, Events.DURATION, Events.ALL_DAY, Events.EVENT_TIMEZONE, Events.STATUS }, null, null, null)) {
            if (q != null && q.moveToFirst() && q.getInt(3) == 0) {
                Ev e = new Ev();
                e.id = id; e.title = Sync.nz(q.getString(0)); e.rrule = Sync.nz(q.getString(1));
                e.origId = q.isNull(2) ? 0 : q.getLong(2);
                e.start = q.getLong(4); e.dtend = q.isNull(5) ? 0 : q.getLong(5); e.duration = Sync.nz(q.getString(6));
                e.allDay = q.getInt(7) == 1; e.tz = Sync.nz(q.getString(8)); e.status = q.isNull(9) ? 0 : q.getInt(9);
                return e;
            }
        }
        return null;
    }

    static boolean exists(Context c, long id) { return eventInfo(c, id) != null; }

    static SimpleDateFormat fmt(String f, TimeZone tz) { SimpleDateFormat s = new SimpleDateFormat(f, Locale.US); s.setTimeZone(tz); return s; }
}
