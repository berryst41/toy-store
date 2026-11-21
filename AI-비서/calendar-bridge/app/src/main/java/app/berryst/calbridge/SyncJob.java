package app.berryst.calbridge;

import android.app.job.JobInfo;
import android.app.job.JobParameters;
import android.app.job.JobScheduler;
import android.app.job.JobService;
import android.content.ComponentName;
import android.content.Context;
import android.provider.CalendarContract;

/**
 * 폰이 알아서 깨워 주는 일꾼.
 *  - 30분마다 한 번 (인터넷이 될 때)
 *  - 폰 캘린더가 바뀌면 1~2분 안에 한 번 더 (삼성 캘린더에서 일정을 넣거나 고쳤을 때)
 */
public class SyncJob extends JobService {
    static final int JOB_PERIODIC = 1, JOB_CHANGED = 2;

    static void schedule(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        ComponentName me = new ComponentName(c, SyncJob.class);
        if (js.getPendingJob(JOB_PERIODIC) == null) {
            js.schedule(new JobInfo.Builder(JOB_PERIODIC, me)
                .setPeriodic(30 * 60 * 1000L, 10 * 60 * 1000L)
                .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                .setPersisted(true) // 폰을 다시 켜도 이어서
                .build());
        }
        scheduleChanged(c);
    }

    /** 캘린더가 바뀌면 깨우기 (한 번 울리면 다시 걸어 둬야 해요) */
    static void scheduleChanged(Context c) {
        if (!Sync.hasPermission(c)) return;
        JobScheduler js = c.getSystemService(JobScheduler.class);
        js.schedule(new JobInfo.Builder(JOB_CHANGED, new ComponentName(c, SyncJob.class))
            .addTriggerContentUri(new JobInfo.TriggerContentUri(CalendarContract.Events.CONTENT_URI, JobInfo.TriggerContentUri.FLAG_NOTIFY_FOR_DESCENDANTS))
            .addTriggerContentUri(new JobInfo.TriggerContentUri(CalendarContract.Calendars.CONTENT_URI, 0))
            .setTriggerContentUpdateDelay(60 * 1000L)   // 여러 개를 한꺼번에 고칠 때는 1분 기다렸다가 한 번만
            .setTriggerContentMaxDelay(3 * 60 * 1000L)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .build());
    }

    static void cancel(Context c) {
        JobScheduler js = c.getSystemService(JobScheduler.class);
        js.cancel(JOB_PERIODIC); js.cancel(JOB_CHANGED);
    }

    @Override public boolean onStartJob(JobParameters params) {
        new Thread(() -> {
            if (Api.loggedIn(this)) Sync.run(this);
            if (params.getJobId() == JOB_CHANGED) scheduleChanged(this);
            jobFinished(params, false);
        }).start();
        return true;
    }

    @Override public boolean onStopJob(JobParameters params) { return true; }
}
