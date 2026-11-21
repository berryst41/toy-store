package app.berryst.calbridge;

import android.Manifest;
import android.content.ContentUris;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.CalendarContract;
import android.provider.Settings;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.TimeZone;

/** 폰의 캘린더를 읽어서 서버에 보내요. 폰 캘린더는 절대 고치지 않아요(읽기만). */
public class Sync {
    static final int DAYS_BACK = 1, DAYS_AHEAD = 60, MAX_EVENTS = 1500;

    static boolean hasPermission(Context c) {
        return c.checkSelfPermission(Manifest.permission.READ_CALENDAR) == PackageManager.PERMISSION_GRANTED;
    }

    /** 기기 이름표: 처음 한 번 만들어 계속 써요 (폰을 바꾸면 새 줄이 생겨요) */
    static String device(Context c) {
        SharedPreferences p = Api.prefs(c);
        String d = p.getString("device", null);
        if (d == null) {
            String a = Settings.Secure.getString(c.getContentResolver(), Settings.Secure.ANDROID_ID);
            d = "android-" + (a != null ? a : String.valueOf(System.currentTimeMillis()));
            p.edit().putString("device", d).apply();
        }
        return d;
    }

    /** 한 번 보내기. 결과 글을 돌려주고, 화면에 보이게 저장도 해요. */
    static synchronized String run(Context c) {
        SharedPreferences p = Api.prefs(c);
        try {
            if (!Api.loggedIn(c)) throw new Exception("로그인이 필요해요");
            if (!hasPermission(c)) throw new Exception("캘린더 읽기 권한이 없어요. 앱을 열어 [캘린더 권한 허용]을 눌러 주세요");

            // 1) 캘린더 목록 (삼성 계정, 구글, 내 폰 …)
            JSONArray cals = new JSONArray();
            Map<Long, Boolean> visible = new HashMap<>();
            String[] cc = { CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME,
                CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.Calendars.CALENDAR_COLOR, CalendarContract.Calendars.VISIBLE };
            try (Cursor q = c.getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cc, null, null, null)) {
                while (q != null && q.moveToNext()) {
                    long id = q.getLong(0);
                    boolean vis = q.getInt(5) == 1;
                    visible.put(id, vis);
                    cals.put(new JSONObject().put("id", String.valueOf(id)).put("name", nz(q.getString(1)))
                        .put("account", nz(q.getString(2))).put("type", nz(q.getString(3)))
                        .put("color", String.format("#%06X", 0xFFFFFF & q.getInt(4))).put("visible", vis));
                }
            }

            // 2) 어제부터 60일 뒤까지의 일정 (반복 일정은 하루하루 펼쳐서)
            Calendar from = Calendar.getInstance();
            from.set(Calendar.HOUR_OF_DAY, 0); from.set(Calendar.MINUTE, 0); from.set(Calendar.SECOND, 0); from.set(Calendar.MILLISECOND, 0);
            from.add(Calendar.DAY_OF_MONTH, -DAYS_BACK);
            Calendar to = (Calendar) from.clone();
            to.add(Calendar.DAY_OF_MONTH, DAYS_BACK + DAYS_AHEAD + 1);
            Uri.Builder ub = CalendarContract.Instances.CONTENT_URI.buildUpon();
            ContentUris.appendId(ub, from.getTimeInMillis());
            ContentUris.appendId(ub, to.getTimeInMillis());
            String[] ic = { CalendarContract.Instances.EVENT_ID, CalendarContract.Instances.BEGIN, CalendarContract.Instances.END,
                CalendarContract.Instances.TITLE, CalendarContract.Instances.EVENT_LOCATION, CalendarContract.Instances.ALL_DAY,
                CalendarContract.Instances.CALENDAR_ID, CalendarContract.Instances.STATUS, CalendarContract.Instances.SELF_ATTENDEE_STATUS };

            SimpleDateFormat dLocal = fmt("yyyy-MM-dd", TimeZone.getDefault()), tLocal = fmt("HH:mm", TimeZone.getDefault());
            SimpleDateFormat dUtc = fmt("yyyy-MM-dd", TimeZone.getTimeZone("UTC"));
            JSONArray evs = new JSONArray();
            try (Cursor q = c.getContentResolver().query(ub.build(), ic, null, null, CalendarContract.Instances.BEGIN + " ASC")) {
                while (q != null && q.moveToNext() && evs.length() < MAX_EVENTS) {
                    if (q.getInt(7) == CalendarContract.Events.STATUS_CANCELED) continue;              // 취소된 일정
                    if (q.getInt(8) == CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED) continue;   // 거절한 초대
                    long cal = q.getLong(6), begin = q.getLong(1), end = q.getLong(2);
                    boolean allDay = q.getInt(5) == 1;
                    JSONObject e = new JSONObject()
                        .put("id", q.getLong(0) + "_" + begin)
                        .put("cal", String.valueOf(cal))
                        .put("title", nz(q.getString(3)).isEmpty() ? "(제목 없음)" : q.getString(3))
                        .put("all_day", allDay);
                    String loc = nz(q.getString(4));
                    if (!loc.isEmpty()) e.put("loc", loc);
                    if (allDay) {
                        // 종일 일정은 '세계 표준시 자정'으로 저장돼 있어요 → 날짜만 그대로 꺼내요
                        e.put("date", dUtc.format(begin)).put("time", "").put("end", "");
                        String last = dUtc.format(Math.max(begin, end - 1));
                        if (!last.equals(dUtc.format(begin))) e.put("end_date", last);
                    } else {
                        e.put("date", dLocal.format(begin)).put("time", tLocal.format(begin)).put("end", tLocal.format(end));
                        String last = dLocal.format(end);
                        if (!last.equals(dLocal.format(begin))) e.put("end_date", last);
                    }
                    evs.put(e);
                }
            }

            // 3) 서버에 올리기 (기기마다 한 줄을 통째로 바꿔요)
            JSONObject row = new JSONObject()
                .put("user_id", p.getString("uid", ""))
                .put("device", device(c))
                .put("name", Build.MANUFACTURER + " " + Build.MODEL)
                .put("calendars", cals)
                .put("events", evs)
                .put("range_from", dLocal.format(from.getTimeInMillis()))
                .put("range_to", dLocal.format(to.getTimeInMillis() - 1))
                .put("app_version", BuildConfigVersion.name(c))
                .put("synced_at", iso(System.currentTimeMillis()));
            Api.http("POST", "/rest/v1/ai_phone_cal?on_conflict=user_id,device", Api.token(c), new JSONArray().put(row).toString(), "resolution=merge-duplicates,return=minimal");

            String msg = "✅ 캘린더 " + cals.length() + "개 · 일정 " + evs.length() + "개 보냄";
            p.edit().putLong("last_ok", System.currentTimeMillis()).putString("last_msg", msg).remove("last_err").apply();
            return msg;
        } catch (Exception e) {
            String m = "⚠️ " + e.getMessage();
            p.edit().putLong("last_try", System.currentTimeMillis()).putString("last_err", m).apply();
            return m;
        }
    }

    static String nz(String s) { return s == null ? "" : s; }
    static SimpleDateFormat fmt(String f, TimeZone tz) { SimpleDateFormat s = new SimpleDateFormat(f, Locale.US); s.setTimeZone(tz); return s; }
    static String iso(long ms) { return fmt("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone("UTC")).format(ms); }

    /** 앱 버전 글자 (화면·서버에 같이 보여요) */
    static class BuildConfigVersion {
        static String name(Context c) {
            try { return c.getPackageManager().getPackageInfo(c.getPackageName(), 0).versionName; } catch (Exception e) { return "?"; }
        }
    }
}
