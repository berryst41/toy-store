package app.berryst.calbridge;

import android.content.Context;
import android.content.SharedPreferences;

import com.google.android.gms.tasks.Tasks;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.messaging.FirebaseMessaging;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

/**
 * ⚡ 바로 깨우기 준비 (v0.4.0)
 *  1) Firebase 설정은 앱 안에 넣지 않고 AI 딸기 서버(ai-google 함수, 주인만)에서 받아요 → 설정이 바뀌어도 앱을 다시 깔 필요 없어요.
 *  2) 이 폰의 알림 열쇠(token)를 서버 표 ai_phone_cal.fcm 칸에 적어 둬요.
 *  3) 서버는 PC에서 [허락]할 때 이 열쇠로 조용한 신호를 보내요 → PushService가 받아요.
 */
public class Push {
    /** 저장해 둔 설정으로 Firebase를 켜요(이미 켜져 있으면 그대로). 실패해도 앱은 멀쩡해야 해요 */
    static boolean init(Context c) {
        try {
            if (!FirebaseApp.getApps(c).isEmpty()) return true;
            String s = Api.prefs(c).getString("fcmcfg", "");
            if (s.isEmpty()) return false;
            JSONObject j = new JSONObject(s);
            FirebaseApp.initializeApp(c, new FirebaseOptions.Builder()
                .setApiKey(j.getString("apiKey"))
                .setApplicationId(j.getString("appId"))
                .setProjectId(j.getString("projectId"))
                .setGcmSenderId(j.optString("senderId", j.optString("messagingSenderId")))
                .build());
            return true;
        } catch (Throwable e) { return false; }
    }

    /** 보내기 때마다 불러요(백그라운드). 설정 받기 → Firebase 켜기 → 열쇠를 서버에 적기 */
    static void ensure(Context c) {
        SharedPreferences p = Api.prefs(c);
        try {
            // 1) 설정이 없으면(또는 하루에 한 번) 서버에서 받아요
            if (p.getString("fcmcfg", "").isEmpty() || System.currentTimeMillis() - p.getLong("fcmcfg_at", 0) > 24 * 3600_000L) {
                JSONObject r = new JSONObject(Api.http("POST", "/functions/v1/ai-google", Api.token(c), new JSONObject().put("action", "bridge_fcm").toString(), null));
                JSONObject cfg = r.optJSONObject("config");
                p.edit().putLong("fcmcfg_at", System.currentTimeMillis()).apply();
                if (cfg == null) { p.edit().putString("push_state", "아직 준비 전이에요 (서버에 Firebase 설정이 없어요)").apply(); return; }
                if (!cfg.toString().equals(p.getString("fcmcfg", ""))) {
                    boolean had = !p.getString("fcmcfg", "").isEmpty();
                    p.edit().putString("fcmcfg", cfg.toString()).remove("fcm_sent").apply();
                    if (had && !FirebaseApp.getApps(c).isEmpty()) { // 설정이 바뀌었으면 앱을 다시 켤 때 적용돼요
                        p.edit().putString("push_state", "새 설정을 받았어요. 폰을 다시 켜거나 앱을 껐다 켜면 적용돼요").apply();
                        return;
                    }
                }
            }
            if (!init(c)) { p.edit().putString("push_state", "⚠️ Firebase를 켜지 못했어요").apply(); return; }
            // 2) 이 폰의 알림 열쇠 받기
            String tok = Tasks.await(FirebaseMessaging.getInstance().getToken(), 30, TimeUnit.SECONDS);
            if (tok == null || tok.isEmpty()) throw new Exception("알림 열쇠를 못 받았어요");
            // 3) 바뀌었을 때만 서버에 적기
            if (!tok.equals(p.getString("fcm_sent", ""))) {
                String dev = android.net.Uri.encode(Sync.device(c));
                Api.http("PATCH", "/rest/v1/ai_phone_cal?device=eq." + dev, Api.token(c), new JSONObject().put("fcm", tok).toString(), "return=minimal");
                p.edit().putString("fcm_sent", tok).apply();
            }
            p.edit().putString("push_state", "✅ 켜짐 — PC에서 [허락]해도 몇 초 안에 들어가요").apply();
        } catch (Throwable e) {
            Throwable t = e.getCause() != null ? e.getCause() : e;
            p.edit().putString("push_state", "⚠️ " + t.getMessage()).putLong("fcmcfg_at", 0).apply(); // 다음 번에 설정부터 다시 받아요
        }
    }
}
