package app.berryst.calbridge;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.CalendarContract;
import android.provider.Settings;
import android.text.InputType;
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.View;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

/** 하나뿐인 화면: 로그인 → 권한 허용 → 배터리 제한 풀기 → 끝. 그다음은 앱을 안 열어도 30분마다 알아서 보내요. */
public class MainActivity extends Activity {
    static final int PINK = Color.parseColor("#E0315B"), GRAY = Color.parseColor("#666666"), OK = Color.parseColor("#1E8E3E");
    LinearLayout box;
    final Handler ui = new Handler(Looper.getMainLooper());
    boolean busy = false;

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        ScrollView sv = new ScrollView(this);
        sv.setBackgroundColor(Color.parseColor("#FFF7F8"));
        sv.setFitsSystemWindows(true);
        box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int p = dp(20); box.setPadding(p, p, p, p);
        sv.addView(box);
        setContentView(sv);
    }

    @Override protected void onResume() { super.onResume(); draw(); ui.post(watch); }
    @Override protected void onPause() { super.onPause(); ui.removeCallbacks(watch); }

    /** 이 화면이 켜져 있는 동안은 5초마다 AI 딸기 쪽지를 확인해서 바로 넣어요 */
    final Runnable watch = new Runnable() {
        @Override public void run() {
            ui.removeCallbacks(this);
            if (Api.loggedIn(MainActivity.this) && Sync.hasWrite(MainActivity.this) && !busy) {
                new Thread(() -> {
                    int n = Cmd.process(MainActivity.this);
                    if (n > 0) { Sync.run(MainActivity.this); ui.post(() -> { android.widget.Toast.makeText(MainActivity.this, "🍓 폰 캘린더에 " + n + "개 반영했어요", android.widget.Toast.LENGTH_SHORT).show(); draw(); }); }
                }).start();
            }
            ui.postDelayed(this, 5000);
        }
    };

    void askPerm() { requestPermissions(new String[]{ Manifest.permission.READ_CALENDAR, Manifest.permission.WRITE_CALENDAR }, 1); }

    void draw() {
        box.removeAllViews();
        text("🍓 캘린더 다리", 26, Color.BLACK, true);
        text("폰에 있는 모든 캘린더(삼성 계정·구글·내 폰)를 15분마다 읽어서 AI 딸기에 보내 줘요. AI 딸기에서 [허락]한 일정만 폰 캘린더에 넣거나 고치거나 지워요.", 15, GRAY, false);
        gap(12);

        if (!Api.loggedIn(this)) { drawLogin(); return; }

        android.content.SharedPreferences pr = Api.prefs(this);
        text("👤 " + pr.getString("email", "") + " 로 로그인됨", 15, Color.BLACK, false);
        gap(8);

        // ① 캘린더 권한 (읽기 + 쓰기)
        boolean perm = Sync.hasPermission(this), wr = Sync.hasWrite(this);
        step("① 캘린더 읽기·쓰기 권한", perm && wr ? "✅ 허용됨 (AI 딸기에서 허락한 일정 넣기·고치기·지우기도 돼요)" : perm ? "읽기만 허용됨 — 쓰기도 허용해야 AI 딸기가 일정을 넣을 수 있어요" : "아직 허용 안 됨", perm && wr);
        if (!perm || !wr) button("캘린더 권한 허용하기", v -> askPerm());

        // ② 배터리 제한 풀기
        PowerManager pm = getSystemService(PowerManager.class);
        boolean bat = pm.isIgnoringBatteryOptimizations(getPackageName());
        step("② 배터리 사용 '제한 없음'", bat ? "✅ 됐어요 (앱이 잠들지 않아요)" : "아직이에요 — 안 하면 폰이 앱을 재워서 일정이 늦게 갈 수 있어요", bat);
        if (!bat) button("배터리 제한 풀기", v -> {
            try { startActivity(new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:" + getPackageName()))); }
            catch (Exception e) { openAppSettings(); }
        });
        small("갤럭시는 '설정 → 배터리 → 백그라운드 사용 제한'의 '절전 상태 앱 / 딥 슬립 앱' 목록에 이 앱이 없어야 해요. 아래 버튼 → 배터리 → '제한 없음'으로도 바꿀 수 있어요.");
        button("이 앱 설정 열기", v -> openAppSettings());

        // ③ 보내기 상태
        long ok = pr.getLong("last_ok", 0);
        String err = pr.getString("last_err", null);
        step("③ AI 딸기로 보내기", ok > 0 ? pr.getString("last_msg", "") + "\n(" + DateUtils.getRelativeTimeSpanString(ok) + ")" : "아직 한 번도 안 보냈어요", ok > 0 && err == null);
        if (err != null) text(err, 14, PINK, false);
        String cerr = pr.getString("cmd_err", null);
        if (cerr != null) text(cerr, 14, PINK, false);
        if (pr.getInt("cmd_count", 0) > 0) small("📝 AI 딸기 부탁으로 폰 캘린더에 반영한 것: " + pr.getInt("cmd_count", 0) + "개 (마지막 " + DateUtils.getRelativeTimeSpanString(pr.getLong("cmd_last", 0)) + ")");
        button(busy ? "보내는 중…" : "지금 보내기", v -> sendNow());

        // ④ 바로 깨우기 (PC에서 허락해도 몇 초 안에)
        String ps = pr.getString("push_state", "");
        step("④ ⚡ 바로 깨우기", ps.isEmpty() ? "[지금 보내기]를 한 번 누르면 준비돼요" : ps
            + (pr.getLong("push_last", 0) > 0 ? "\n(마지막 신호 " + DateUtils.getRelativeTimeSpanString(pr.getLong("push_last", 0)) + ")" : ""), ps.startsWith("✅"));

        // ⑤ 보낼 캘린더 고르기 — 체크를 끄면 그 캘린더 일정은 AI 딸기로 안 보내요
        if (perm) {
            gap(12);
            text("📚 AI 딸기로 보낼 캘린더", 17, Color.BLACK, true);
            small("필요한 캘린더만 체크해 두세요. 바꾸면 바로 다시 보내요. 구글 계정으로 이미 연결한 캘린더와 겹치는 일정은 AI 딸기에서 한 번만 보여요.");
            java.util.Set<String> skip = Sync.skipped(this);
            String[] cc = { CalendarContract.Calendars._ID, CalendarContract.Calendars.CALENDAR_DISPLAY_NAME, CalendarContract.Calendars.ACCOUNT_NAME, CalendarContract.Calendars.ACCOUNT_TYPE, CalendarContract.Calendars.CALENDAR_COLOR, CalendarContract.Calendars.VISIBLE };
            try (Cursor q = getContentResolver().query(CalendarContract.Calendars.CONTENT_URI, cc, null, null, null)) {
                while (q != null && q.moveToNext()) {
                    String id = String.valueOf(q.getLong(0));
                    String label = "● " + Sync.nz(q.getString(1)) + "  ·  " + kind(q.getString(3), q.getString(2)) + (q.getInt(5) == 1 ? "" : "  (삼성 캘린더에서 숨김)");
                    // 맨 앞 ● 를 그 캘린더 색으로
                    android.text.SpannableString s = new android.text.SpannableString(label);
                    s.setSpan(new android.text.style.ForegroundColorSpan(0xFF000000 | q.getInt(4)), 0, 1, 0);
                    CheckBox cb = new CheckBox(this);
                    cb.setText(s); cb.setTextSize(14); cb.setTextColor(Color.DKGRAY);
                    cb.setChecked(!skip.contains(id));
                    cb.setOnCheckedChangeListener((btn, on) -> { Sync.setSkipped(this, id, !on); sendSoon(); });
                    box.addView(cb);
                }
            } catch (Exception e) { small("목록을 못 읽었어요: " + e.getMessage()); }
        }

        gap(20);
        small("앱 버전 v" + Sync.BuildConfigVersion.name(this) + " · 기기 " + android.os.Build.MODEL);
        button("로그아웃 (보내기 멈추기)", v -> { SyncJob.cancel(this); Api.logout(this); draw(); });
    }

    /** 계정 종류를 쉬운 말로 */
    static String kind(String type, String account) {
        String t = type == null ? "" : type;
        if (t.equals("com.google")) return "구글 " + Sync.nz(account);
        if (t.contains("osp") || t.contains("samsung")) return "삼성 계정";
        if (t.equalsIgnoreCase("LOCAL") || t.contains("local")) return "내 폰";
        if (t.contains("exchange") || t.contains("outlook")) return "Outlook " + Sync.nz(account);
        return Sync.nz(account).isEmpty() ? t : Sync.nz(account);
    }

    void drawLogin() {
        step("AI 딸기 계정으로 로그인", "AI 딸기 ⚙️ 설정에서 로그인할 때 쓰는 이메일과 비밀번호를 넣어 주세요. 비밀번호는 폰에 저장하지 않아요.", false);
        EditText em = new EditText(this); em.setHint("이메일"); em.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS); box.addView(em);
        EditText pw = new EditText(this); pw.setHint("비밀번호"); pw.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD); box.addView(pw);
        TextView msg = text("", 14, PINK, false);
        button("로그인", v -> {
            String e = em.getText().toString(), w = pw.getText().toString();
            if (e.trim().isEmpty() || w.isEmpty()) { msg.setText("이메일과 비밀번호를 모두 넣어 주세요"); return; }
            v.setEnabled(false); msg.setText("로그인하는 중…");
            new Thread(() -> {
                String err = null;
                try { Api.login(this, e, w); } catch (Exception x) { err = x.getMessage(); }
                String fe = err;
                ui.post(() -> {
                    v.setEnabled(true);
                    if (fe != null) { msg.setText("⚠️ " + (fe.contains("Invalid login") ? "이메일이나 비밀번호가 틀렸어요" : fe)); return; }
                    SyncJob.schedule(this);
                    draw();
                    if (!Sync.hasPermission(this) || !Sync.hasWrite(this)) askPerm();
                    else sendNow();
                });
            }).start();
        });
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (Sync.hasPermission(this)) { SyncJob.schedule(this); sendNow(); }
        if ((!Sync.hasPermission(this) || !Sync.hasWrite(this)) && !shouldShowRequestPermissionRationale(Manifest.permission.READ_CALENDAR)) {
            // '다시 묻지 않음'이 된 경우: 설정 화면에서 직접 켜야 해요
            openAppSettings();
        }
        draw();
    }

    void sendNow() {
        if (busy) return;
        busy = true; draw();
        new Thread(() -> { Sync.run(this); ui.post(() -> { busy = false; draw(); }); }).start();
    }

    /** 체크를 여러 개 연달아 바꿀 수 있으니, 마지막으로 바꾸고 2초 뒤에 한 번만 보내요 */
    final Runnable sendLater = () -> { if (busy) sendSoon(); else sendNow(); }; // 보내는 중이면 끝난 뒤에 다시
    void sendSoon() { ui.removeCallbacks(sendLater); ui.postDelayed(sendLater, 2000); }

    void openAppSettings() {
        startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + getPackageName())));
    }

    /* ---------- 화면 조각 ---------- */
    int dp(int v) { return (int) (v * getResources().getDisplayMetrics().density); }
    void gap(int h) { View v = new View(this); box.addView(v, new LinearLayout.LayoutParams(1, dp(h))); }
    TextView text(String s, int size, int color, boolean bold) {
        TextView t = new TextView(this); t.setText(s); t.setTextSize(size); t.setTextColor(color);
        if (bold) t.setTypeface(Typeface.DEFAULT_BOLD);
        t.setPadding(0, dp(3), 0, dp(3)); box.addView(t); return t;
    }
    void small(String s) { text(s, 13, GRAY, false); }
    void step(String title, String state, boolean done) {
        LinearLayout card = new LinearLayout(this); card.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(Color.WHITE); bg.setCornerRadius(dp(12)); bg.setStroke(dp(1), done ? OK : Color.parseColor("#F3B6C3"));
        card.setBackground(bg); card.setPadding(dp(14), dp(10), dp(14), dp(10));
        TextView a = new TextView(this); a.setText(title); a.setTextSize(16); a.setTypeface(Typeface.DEFAULT_BOLD); a.setTextColor(Color.BLACK);
        TextView s = new TextView(this); s.setText(state); s.setTextSize(14); s.setTextColor(done ? OK : GRAY);
        card.addView(a); card.addView(s);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, -2); lp.topMargin = dp(10);
        box.addView(card, lp);
    }
    void button(String label, View.OnClickListener l) {
        Button b = new Button(this); b.setText(label); b.setAllCaps(false); b.setTextSize(16); b.setTextColor(Color.WHITE);
        GradientDrawable bg = new GradientDrawable(); bg.setColor(PINK); bg.setCornerRadius(dp(10)); b.setBackground(bg);
        b.setGravity(Gravity.CENTER); b.setOnClickListener(l);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(-1, dp(48)); lp.topMargin = dp(8);
        box.addView(b, lp);
    }
}
