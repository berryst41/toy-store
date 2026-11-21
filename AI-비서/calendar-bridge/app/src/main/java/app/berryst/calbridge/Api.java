package app.berryst.calbridge;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/** AI 딸기 서버(Supabase)와 이야기하는 곳. 비밀번호는 저장하지 않고, 로그인 뒤 받은 '이어 쓰기 열쇠'(refresh token)만 폰 안에 둬요. */
public class Api {
    // AI 딸기(index.html)와 같은 서버·같은 공개 키 (공개돼도 안전한 키. 데이터는 잠금 규칙으로 주인만 봐요)
    static final String SB_URL = "https://aaiplfmwljguzsvgdxit.supabase.co";
    static final String SB_KEY = "sb_publishable_CJMXrbPYqKs8a1cxvYyQbw_iJtzslLD";

    static SharedPreferences prefs(Context c) { return c.getSharedPreferences("bridge", Context.MODE_PRIVATE); }

    static boolean loggedIn(Context c) { return prefs(c).getString("refresh", null) != null; }

    /** 서버에 요청 보내기. 실패하면 서버가 준 말을 담아 예외를 던져요. */
    static String http(String method, String path, String token, String body, String prefer) throws Exception {
        HttpURLConnection h = (HttpURLConnection) new URL(SB_URL + path).openConnection();
        h.setRequestMethod(method);
        h.setConnectTimeout(20000);
        h.setReadTimeout(30000);
        h.setRequestProperty("apikey", SB_KEY);
        h.setRequestProperty("Authorization", "Bearer " + (token != null ? token : SB_KEY));
        h.setRequestProperty("Content-Type", "application/json");
        if (prefer != null) h.setRequestProperty("Prefer", prefer);
        if (body != null) {
            h.setDoOutput(true);
            try (OutputStream o = h.getOutputStream()) { o.write(body.getBytes(StandardCharsets.UTF_8)); }
        }
        int code = h.getResponseCode();
        InputStream in = code < 400 ? h.getInputStream() : h.getErrorStream();
        String text = "";
        if (in != null) {
            ByteArrayOutputStream b = new ByteArrayOutputStream();
            byte[] buf = new byte[8192]; int n;
            while ((n = in.read(buf)) > 0) b.write(buf, 0, n);
            in.close();
            text = b.toString("UTF-8");
        }
        h.disconnect();
        if (code >= 400) {
            String m = text;
            try { JSONObject j = new JSONObject(text); m = j.optString("msg", j.optString("message", j.optString("error_description", j.optString("error", text)))); } catch (Exception ignore) {}
            throw new Exception("서버 " + code + ": " + m);
        }
        return text;
    }

    /** 이메일+비밀번호로 로그인 (AI 딸기와 같은 계정). 비밀번호는 여기서만 쓰고 저장하지 않아요. */
    static synchronized void login(Context c, String email, String password) throws Exception {
        JSONObject b = new JSONObject().put("email", email.trim()).put("password", password);
        save(c, new JSONObject(http("POST", "/auth/v1/token?grant_type=password", null, b.toString(), null)));
        // AI 딸기의 주인 계정인지 확인
        String ok = http("POST", "/rest/v1/rpc/ai_is_owner", token(c), "{}", null).trim();
        if (!"true".equals(ok)) { logout(c); throw new Exception("이 계정은 AI 딸기의 주인 계정이 아니에요. AI 딸기에 로그인하는 계정으로 해 주세요"); }
    }

    static void save(Context c, JSONObject j) throws Exception {
        JSONObject user = j.optJSONObject("user");
        SharedPreferences.Editor e = prefs(c).edit()
            .putString("access", j.getString("access_token"))
            .putString("refresh", j.getString("refresh_token"))
            .putLong("exp", System.currentTimeMillis() + j.optLong("expires_in", 3600) * 1000L - 120000L);
        if (user != null) e.putString("uid", user.optString("id")).putString("email", user.optString("email"));
        e.apply();
    }

    /** 쓸 수 있는 출입증(access token). 시간이 다 됐으면 열쇠로 새로 받아요. */
    static synchronized String token(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        String refresh = p.getString("refresh", null);
        if (refresh == null) throw new Exception("로그인이 필요해요");
        if (System.currentTimeMillis() < p.getLong("exp", 0)) return p.getString("access", null);
        JSONObject b = new JSONObject().put("refresh_token", refresh);
        try {
            save(c, new JSONObject(http("POST", "/auth/v1/token?grant_type=refresh_token", null, b.toString(), null)));
        } catch (Exception e) {
            // 열쇠가 더는 안 맞으면(비밀번호를 바꿨거나 로그아웃됨) 다시 로그인해야 해요
            if (e.getMessage() != null && (e.getMessage().contains(" 400") || e.getMessage().contains(" 401"))) {
                p.edit().remove("refresh").remove("access").putString("need_login", "1").apply();
                throw new Exception("다시 로그인해 주세요");
            }
            throw e;
        }
        return p.getString("access", null);
    }

    static void logout(Context c) {
        prefs(c).edit().remove("refresh").remove("access").remove("exp").remove("uid").remove("email").apply();
    }
}
