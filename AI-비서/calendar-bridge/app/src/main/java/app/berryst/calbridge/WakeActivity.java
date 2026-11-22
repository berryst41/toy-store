package app.berryst.calbridge;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.Toast;

/**
 * 폰의 AI 딸기에서 [허락]을 누르면 AI 딸기가 calbridge://run 주소로 이 화면을 잠깐 열어요.
 * 화면 없이(투명) 쪽지를 바로 처리하고 일정을 다시 보낸 뒤 스스로 닫혀서 AI 딸기로 돌아가요.
 */
public class WakeActivity extends Activity {
    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        Handler ui = new Handler(Looper.getMainLooper());
        new Thread(() -> {
            String msg;
            if (!Api.loggedIn(this)) msg = "🍓 캘린더 다리: 먼저 앱을 열어 로그인해 주세요";
            else if (!Sync.hasWrite(this)) msg = "🍓 캘린더 다리: 앱을 열어 캘린더 쓰기 권한을 허용해 주세요";
            else {
                int n = Cmd.process(this);
                Sync.run(this); // 바뀐 일정을 AI 딸기로 바로 다시 보내요
                msg = n > 0 ? "🍓 폰 캘린더에 " + n + "개 반영했어요" : "🍓 캘린더 다리: 처리할 쪽지가 없어요";
            }
            String m = msg;
            ui.post(() -> { Toast.makeText(this, m, Toast.LENGTH_SHORT).show(); finish(); });
        }).start();
    }
}
