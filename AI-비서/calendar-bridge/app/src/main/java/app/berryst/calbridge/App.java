package app.berryst.calbridge;

import android.app.Application;

/** 앱이 켜질 때 한 번: 저장해 둔 Firebase 설정이 있으면 "바로 깨우기" 알림 받기를 켜요. */
public class App extends Application {
    @Override public void onCreate() {
        super.onCreate();
        Push.init(this);
    }
}
