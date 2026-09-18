package com.muzioai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.Base64;
import android.util.Log;

/**
 * Foreground service that owns the Android MediaSession and posts the
 * persistent media notification (Quick Panel widget + lock screen player).
 *
 * Lives independently of the Activity so the notification stays visible
 * while the app is backgrounded. The Capacitor plugin talks to this service
 * via startService(Intent); hardware/BT button callbacks are forwarded back
 * to the WebView via local broadcasts caught by MediaStorePlugin.
 */
public class MuzioPlaybackService extends Service {

    private static final String TAG = "MuzioPlaybackService";

    // Intent actions used between the plugin and this service
    static final String ACTION_UPDATE = "com.muzioai.app.SVC_UPDATE";
    static final String ACTION_HIDE   = "com.muzioai.app.SVC_HIDE";
    // Position-only refresh. Separate from ACTION_UPDATE because that one
    // carries the artwork as base64 and decodes a bitmap; re-sending it every
    // couple of seconds just to move a progress bar would be wasteful.
    static final String ACTION_POSITION = "com.muzioai.app.SVC_POSITION";
    // Start/stop watching for the end of an interruption. See startResumeWatch().
    static final String ACTION_WATCH_RESUME = "com.muzioai.app.SVC_WATCH_RESUME";

    // Notification broadcast actions (shared with MediaStorePlugin's receiver)
    private static final String ACTION_PREV       = "com.muzioai.app.ACTION_PREV";
    private static final String ACTION_PLAY_PAUSE = "com.muzioai.app.ACTION_PLAY_PAUSE";
    private static final String ACTION_NEXT       = "com.muzioai.app.ACTION_NEXT";
    private static final String ACTION_CLOSE      = "com.muzioai.app.ACTION_CLOSE";
    static final String         ACTION_SEEK       = "com.muzioai.app.ACTION_SEEK";
    static final String         ACTION_RESUME     = "com.muzioai.app.ACTION_RESUME";
    static final String         EXTRA_SEEK_MS     = "seek_ms";

    private static final String NOTIF_CHANNEL_ID = "muzio_playback";
    static final int             NOTIF_ID         = 7001;

    // Visible to the plugin so it knows whether to use startForegroundService()
    static volatile boolean isRunning = false;

    private NotificationManager notifMgr;
    private MediaSession        mediaSession;

    /*
     * No audio focus request here, deliberately.
     *
     * Playback happens in the WebView, and Chromium already requests focus for
     * the media element it is playing. Requesting a second time from this
     * service meant one app holding two focus requests: granting ours revoked
     * Chromium's, Chromium pauses its element on focus loss, and the track
     * stopped the instant it started. Pressing play looked like pressing it
     * twice and left the button on pause.
     *
     * Whoever owns playback owns the focus. Here that is the WebView, so this
     * service only mirrors state into the MediaSession and the notification.
     */

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        notifMgr  = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        ensureChannel();
        ensureMediaSession();
        ensureNoisyReceiver();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_HIDE.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        if (intent != null && ACTION_WATCH_RESUME.equals(intent.getAction())) {
            if (intent.getBooleanExtra("watch", false)) startResumeWatch();
            else stopResumeWatch();
            return START_STICKY;
        }
        if (intent != null && ACTION_POSITION.equals(intent.getAction())) {
            updatePlaybackState(
                intent.getBooleanExtra("playing", false),
                intent.getLongExtra("position", 0L),
                intent.getLongExtra("duration", 0L),
                intent.getFloatExtra("speed", 1.0f)
            );
            return START_STICKY;
        }
        // ACTION_UPDATE (or null = re-delivery after process restart)
        String  title    = intent != null ? intent.getStringExtra("title")   : "";
        String  artist   = intent != null ? intent.getStringExtra("artist")  : "";
        String  album    = intent != null ? intent.getStringExtra("album")   : "";
        String  art      = intent != null ? intent.getStringExtra("art")     : "";
        boolean playing  = intent != null && intent.getBooleanExtra("playing",  false);
        long    position = intent != null ? intent.getLongExtra("position",  0L) : 0L;
        long    duration = intent != null ? intent.getLongExtra("duration",  0L) : 0L;
        float   speed    = intent != null ? intent.getFloatExtra("speed", 1.0f)  : 1.0f;
        updateForeground(
            title   != null ? title   : "",
            artist  != null ? artist  : "",
            album   != null ? album   : "",
            art     != null ? art     : "",
            playing, position, duration, speed
        );
        return START_STICKY;
    }

    // ── Resuming after an interruption ───────────────────────────────────────

    /*
     * Why this exists, and why it does not touch audio focus.
     *
     * When something else takes the speaker — a phone call, a video in another
     * app — Chromium pauses the element and the music stops. Getting it back
     * afterwards was tied to the app becoming visible again: the only two
     * things that resumed it were the visibilitychange and Capacitor resume
     * events. Nobody reopens the music app after hanging up the phone, so it
     * simply never came back.
     *
     * The obvious answer is an OnAudioFocusChangeListener, and that is what was
     * tried before. It cannot work here: requesting focus from this service
     * revoked the focus Chromium holds for the WebView's own element, Chromium
     * paused on the loss, and pressing play started and stopped the song in one
     * press. Whoever owns playback owns the focus, and here that is the WebView.
     *
     * So this watches instead of claiming. Two readings, neither of which needs
     * a permission or a focus request:
     *
     *   getMode()       — MODE_NORMAL once a call has ended
     *   isMusicActive() — false once nothing else is playing through the speaker
     *
     * Both clear only when the interruption is genuinely over, which is exactly
     * the condition for picking the song back up. If another music app took over
     * for good, isMusicActive() stays true and we never resume — handing it over
     * is the correct behaviour and stays that way.
     */

    private static final long RESUME_POLL_MS   = 2000L;
    private static final int  RESUME_MAX_TICKS = 150;  // give up after ~5 minutes
    private static final long NOISY_GRACE_MS   = 5000L;

    private Handler  resumeHandler;
    private Runnable resumeTick;
    private int      resumeTicks = 0;

    // When the headphones came out, or Bluetooth dropped.
    private long             lastNoisyAt = 0L;
    private BroadcastReceiver noisyReceiver;

    /*
     * Pulling the headphones out must never start the song again on the
     * loudspeaker. It looks exactly like the end of an interruption from here —
     * the call is over, nothing else is playing — so without this the watch
     * would helpfully blast the track out loud in a quiet room.
     *
     * Android announces it just before it reroutes the audio. The announcement
     * and our own pause can arrive in either order, so it both cancels a watch
     * already running and blocks one from starting for a few seconds after.
     */
    private void ensureNoisyReceiver() {
        if (noisyReceiver != null) return;
        noisyReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context ctx, Intent intent) {
                lastNoisyAt = System.currentTimeMillis();
                stopResumeWatch();
            }
        };
        IntentFilter f = new IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
        try {
            // A protected system broadcast, so NOT_EXPORTED is both correct and
            // what API 34+ requires a registration to state.
            if (Build.VERSION.SDK_INT >= 33) {
                registerReceiver(noisyReceiver, f, Context.RECEIVER_NOT_EXPORTED);
            } else {
                registerReceiver(noisyReceiver, f);
            }
        } catch (Exception e) {
            Log.w(TAG, "noisy receiver: " + e.getMessage());
            noisyReceiver = null;
        }
    }

    private void startResumeWatch() {
        stopResumeWatch();
        // Without the headphone guard registered there is no way to tell a
        // disconnect from the end of a call, and resuming out loud on the
        // speaker is far worse than not resuming at all. Fail closed.
        ensureNoisyReceiver();
        if (noisyReceiver == null) return;
        if (System.currentTimeMillis() - lastNoisyAt < NOISY_GRACE_MS) return;
        final AudioManager am = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        if (am == null) return;
        resumeHandler = new Handler(Looper.getMainLooper());
        resumeTicks   = 0;
        resumeTick = new Runnable() {
            @Override
            public void run() {
                if (resumeHandler == null) return;
                if (++resumeTicks > RESUME_MAX_TICKS) { stopResumeWatch(); return; }
                boolean callOver   = am.getMode() == AudioManager.MODE_NORMAL;
                boolean speakerFree = !am.isMusicActive();
                if (callOver && speakerFree) {
                    stopResumeWatch();
                    broadcast(ACTION_RESUME);
                    return;
                }
                resumeHandler.postDelayed(this, RESUME_POLL_MS);
            }
        };
        resumeHandler.postDelayed(resumeTick, RESUME_POLL_MS);
    }

    private void stopResumeWatch() {
        if (resumeHandler != null && resumeTick != null) resumeHandler.removeCallbacks(resumeTick);
        resumeHandler = null;
        resumeTick    = null;
    }

    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // App swiped from recents — audio also stops (WebView dies), so stop service too
        stopSelf();
    }

    @Override
    public void onDestroy() {
        isRunning = false;
        stopResumeWatch();
        if (noisyReceiver != null) {
            try { unregisterReceiver(noisyReceiver); } catch (Exception ignored) {}
            noisyReceiver = null;
        }
        if (Build.VERSION.SDK_INT >= 33) {
            stopForeground(STOP_FOREGROUND_REMOVE);
        } else {
            //noinspection deprecation
            stopForeground(true);
        }
        releaseMediaSession();
        super.onDestroy();
    }

    // ── Setup helpers ────────────────────────────────────────────────────────

    private void ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        if (notifMgr.getNotificationChannel(NOTIF_CHANNEL_ID) != null) return;
        NotificationChannel ch = new NotificationChannel(
            NOTIF_CHANNEL_ID, "Now Playing", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("My Music playback controls");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        notifMgr.createNotificationChannel(ch);
    }

    private void ensureMediaSession() {
        if (mediaSession != null) return;
        try {
            mediaSession = new MediaSession(this, "MyMusic");
            // FLAG_HANDLES_MEDIA_BUTTONS throws IllegalArgumentException on API 34+
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                //noinspection deprecation
                mediaSession.setFlags(
                    MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                    MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            }

            // Required: declare this as a local music session so Samsung One UI
            // recognises it as a media source and shows the Quick Panel widget.
            // Without USAGE_MEDIA, Samsung's media router filters the session out.
            AudioAttributes audioAttrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_MEDIA)
                .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                .build();
            mediaSession.setPlaybackToLocal(audioAttrs);

            // Required for lock screen controls: Samsung hides the lock screen
            // widget if tapping it cannot launch a host activity.
            int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
            Intent openAct = new Intent(this, MainActivity.class);
            openAct.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            mediaSession.setSessionActivity(
                PendingIntent.getActivity(this, 2000, openAct, piFlags));

            // Callback required on API 34+ for the session to be considered active;
            // routes hardware/Bluetooth button presses to the WebView via broadcasts
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override public void onPlay()           { broadcast(ACTION_PLAY_PAUSE); }
                @Override public void onPause()          { broadcast(ACTION_PLAY_PAUSE); }
                @Override public void onSkipToNext()     { broadcast(ACTION_NEXT); }
                @Override public void onSkipToPrevious() { broadcast(ACTION_PREV); }
                @Override public void onStop()           { broadcast(ACTION_CLOSE); }
                @Override public void onSeekTo(long pos) {
                    Intent si = new Intent(ACTION_SEEK);
                    si.setPackage(getPackageName());
                    si.putExtra(EXTRA_SEEK_MS, pos);
                    sendBroadcast(si);
                }
            });
            mediaSession.setActive(true);
        } catch (Exception e) {
            Log.e(TAG, "MediaSession create failed: " + e.getMessage(), e);
            mediaSession = null;
        }
    }

    private void releaseMediaSession() {
        if (mediaSession == null) return;
        try { mediaSession.setActive(false); mediaSession.release(); } catch (Exception ignored) {}
        mediaSession = null;
    }

    // Send a local broadcast — caught by MediaStorePlugin's receiver which dispatches to JS
    private void broadcast(String action) {
        Intent i = new Intent(action);
        i.setPackage(getPackageName());
        sendBroadcast(i);
    }

    /**
     * Publish where the track actually is.
     *
     * The system draws the lock-screen scrubber by extrapolating from the last
     * position, the rate, and when it was set. Both of those inputs used to be
     * wrong: the state was published once per song and never again, so nothing
     * re-anchored it after a seek or a stall, and the rate was hardcoded to 1.0
     * even at 0.75x or 2x, and even while paused — where a non-zero rate leaves
     * the bar creeping forward on a track that is not playing.
     */
    private void updatePlaybackState(boolean playing, long positionMs,
                                     long durationMs, float speed) {
        if (mediaSession == null) return;
        try {
            long actions = PlaybackState.ACTION_PLAY
                         | PlaybackState.ACTION_PAUSE
                         | PlaybackState.ACTION_SKIP_TO_NEXT
                         | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                         | PlaybackState.ACTION_STOP
                         | PlaybackState.ACTION_SEEK_TO;
            if (positionMs < 0) positionMs = 0;
            if (durationMs > 0 && positionMs > durationMs) positionMs = durationMs;
            mediaSession.setPlaybackState(new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                    playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    positionMs,
                    playing ? (speed > 0 ? speed : 1.0f) : 0f)
                .build());
        } catch (Exception e) {
            Log.e(TAG, "PlaybackState update: " + e.getMessage(), e);
        }
    }

    // ── Core notification update ─────────────────────────────────────────────

    private void updateForeground(String title, String artist, String album,
                                  String artData, boolean playing,
                                  long positionMs, long durationMs, float speed) {
        // Decode album art
        Bitmap artBmp = null;
        if (!artData.isEmpty()) {
            try {
                int comma = artData.indexOf(',');
                String b64 = comma >= 0 ? artData.substring(comma + 1) : artData;
                byte[] bytes = Base64.decode(b64, Base64.DEFAULT);
                artBmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            } catch (Exception e) {
                Log.w(TAG, "art decode: " + e.getMessage());
            }
        }

        // Update MediaSession metadata (drives lock-screen art + Samsung widget)
        if (mediaSession != null) {
            try {
                MediaMetadata.Builder meta = new MediaMetadata.Builder()
                    .putString(MediaMetadata.METADATA_KEY_TITLE,  title)
                    .putString(MediaMetadata.METADATA_KEY_ARTIST, artist)
                    .putString(MediaMetadata.METADATA_KEY_ALBUM,  album);
                // Duration required: Samsung disables the seek bar if this is missing or 0
                if (durationMs > 0) {
                    meta.putLong(MediaMetadata.METADATA_KEY_DURATION, durationMs);
                }
                if (artBmp != null) {
                    meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART,    artBmp)
                        .putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artBmp);
                }
                mediaSession.setMetadata(meta.build());

            } catch (Exception e) {
                Log.e(TAG, "MediaSession update: " + e.getMessage(), e);
            }
            updatePlaybackState(playing, positionMs, durationMs, speed);
        }


        // Build notification
        int piFlags = PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE;
        String pkg  = getPackageName();

        PendingIntent piPrev  = PendingIntent.getBroadcast(this, 1001,
            new Intent(ACTION_PREV).setPackage(pkg),       piFlags);
        PendingIntent piPlay  = PendingIntent.getBroadcast(this, 1002,
            new Intent(ACTION_PLAY_PAUSE).setPackage(pkg), piFlags);
        PendingIntent piNext  = PendingIntent.getBroadcast(this, 1003,
            new Intent(ACTION_NEXT).setPackage(pkg),       piFlags);
        PendingIntent piClose = PendingIntent.getBroadcast(this, 1004,
            new Intent(ACTION_CLOSE).setPackage(pkg),      piFlags);

        Intent openIntent = new Intent(this, MainActivity.class);
        openIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent piOpen = PendingIntent.getActivity(this, 1000, openIntent, piFlags);

        int    playIcon = playing ? android.R.drawable.ic_media_pause
                                  : android.R.drawable.ic_media_play;
        String playLbl  = playing ? "Pause" : "Play";
        String sub      = artist.isEmpty() ? album
                        : album.isEmpty()  ? artist
                        : artist + " • " + album;

        int notifIcon = getResources().getIdentifier(
            "ic_muzio_notification", "drawable", pkg);
        if (notifIcon == 0) notifIcon = android.R.drawable.ic_media_play;

        Notification.Builder nb = new Notification.Builder(this);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nb.setChannelId(NOTIF_CHANNEL_ID);
        }
        nb.setSmallIcon(notifIcon)
          .setContentTitle(title.isEmpty() ? "My Music" : title)
          .setContentText(sub)
          .setLargeIcon(artBmp)
          .setContentIntent(piOpen)
          .setDeleteIntent(piClose)
          .setOngoing(true)
          .setVisibility(Notification.VISIBILITY_PUBLIC)
          .addAction(android.R.drawable.ic_media_previous, "Previous", piPrev)
          .addAction(playIcon, playLbl, piPlay)
          .addAction(android.R.drawable.ic_media_next, "Next", piNext);

        if (mediaSession != null) {
            nb.setStyle(new Notification.MediaStyle()
                .setMediaSession(mediaSession.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        }
        nb.setColor(Color.parseColor("#00a89e"));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nb.setColorized(true);
        }

        try {
            Notification notification = nb.build();
            // API 29+: must declare foreground service type
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(NOTIF_ID, notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
            } else {
                startForeground(NOTIF_ID, notification);
            }
            Log.d(TAG, "startForeground OK — playing=" + playing + " title=" + title);
        } catch (Exception e) {
            Log.e(TAG, "startForeground failed: " + e.getMessage(), e);
        }
    }
}
