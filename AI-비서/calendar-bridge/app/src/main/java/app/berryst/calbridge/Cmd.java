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
 *  - 반복 일정은 고치거나 지우면 전체가 바뀌어서, 폰에서 직접 하도록 막아 둬요.
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

        long id = Long.parseLong(cmd.optString("event_id", "0").split("_")[0]);
        String[] ev = eventInfo(c, id);
        if (ev == null) throw new Exception("그 일정을 폰에서 못 찾았어요(이미 지워졌을 수 있어요)");
        if (!ev[1].isEmpty()) throw new Exception("반복 일정은 전체가 바뀔 수 있어서, 폰 삼성 캘린더에서 직접 고쳐 주세요");

        if (op.equals("delete")) {
            int k = cr.delete(ContentUris.withAppendedId(Events.CONTENT_URI, id), null, null);
            if (k < 1 || exists(c, id)) throw new Exception("지우기가 안 됐어요");
            return "🗑️ 지웠어요 (확인됨): " + ev[0];
        }
        if (op.equals("update")) {
            int k = cr.update(ContentUris.withAppendedId(Events.CONTENT_URI, id), values(d, ev), null, null);
            if (k < 1) throw new Exception("고치기가 안 됐어요");
            String[] after = eventInfo(c, id);
            String want = d.optString("title", "").trim();
            if (after == null || (!want.isEmpty() && !want.equals(after[0]))) throw new Exception("고쳤는데 다시 읽어 보니 그대로예요");
            return "✏️ 고쳤어요 (확인됨): " + after[0];
        }
        throw new Exception("모르는 쪽지예요: " + op);
    }

    /**
     * 날짜·시간을 폰 캘린더 값으로 바꿔요.
     *  - 시간이 없으면 종일 일정(세계 표준시 자정 기준, 안드로이드 규칙)
     *  - 끝 시간이 없으면 1시간짜리
     */
    static ContentValues values(JSONObject d, String[] old) throws Exception {
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

    /** {제목, 반복 규칙(없으면 빈칸)}. 없거나 지워진 일정이면 null */
    static String[] eventInfo(Context c, long id) {
        try (Cursor q = c.getContentResolver().query(ContentUris.withAppendedId(Events.CONTENT_URI, id),
                new String[]{ Events.TITLE, Events.RRULE, Events.ORIGINAL_ID, Events.DELETED }, null, null, null)) {
            if (q != null && q.moveToFirst() && q.getInt(3) == 0)
                return new String[]{ Sync.nz(q.getString(0)), Sync.nz(q.getString(1)) + Sync.nz(q.getString(2)) };
        }
        return null;
    }

    static boolean exists(Context c, long id) { return eventInfo(c, id) != null; }

    static SimpleDateFormat fmt(String f, TimeZone tz) { SimpleDateFormat s = new SimpleDateFormat(f, Locale.US); s.setTimeZone(tz); return s; }
}
