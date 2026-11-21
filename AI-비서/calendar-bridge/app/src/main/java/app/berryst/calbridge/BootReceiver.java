package app.berryst.calbridge;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 폰을 다시 켜거나 앱을 새 버전으로 바꾸면 일꾼을 다시 걸어 둬요. */
public class BootReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context c, Intent i) {
        if (Api.loggedIn(c)) SyncJob.schedule(c);
    }
}
