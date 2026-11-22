package app.berryst.calbridge;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

/**
 * ⚡ 바로 깨우기 (v0.4.0): PC의 AI 딸기에서 [허락]하면 서버가 이 앱에 조용한 신호(FCM)를 보내요.
 * 신호를 받으면 화면에 아무것도 띄우지 않고 쪽지를 바로 처리한 뒤 일정을 다시 보내요.
 */
public class PushService extends FirebaseMessagingService {
    @Override public void onMessageReceived(RemoteMessage m) {
        if (!"1".equals(m.getData().get("wake")) || !Api.loggedIn(this)) return;
        Api.prefs(this).edit().putLong("push_last", System.currentTimeMillis()).apply();
        int n = Cmd.process(this);   // 넣기·고치기·지우기부터 (가장 급한 일)
        if (n > 0) Sync.run(this);   // 바뀐 일정을 AI 딸기로 다시 보내요
    }

    @Override public void onNewToken(String token) {
        // 열쇠가 바뀌면 다음 보내기 때 서버에 새로 알려요
        Api.prefs(this).edit().remove("fcm_sent").apply();
    }
}
