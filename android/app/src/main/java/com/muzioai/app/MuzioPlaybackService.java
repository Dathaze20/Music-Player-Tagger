package com.muzioai.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.os.IBinder;
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

    // Notification broadcast actions (shared with MediaStorePlugin's receiver)
    private static final String ACTION_PREV       = "com.muzioai.app.ACTION_PREV";
    private static final String ACTION_PLAY_PAUSE = "com.muzioai.app.ACTION_PLAY_PAUSE";
    private static final String ACTION_NEXT       = "com.muzioai.app.ACTION_NEXT";
    private static final String ACTION_CLOSE      = "com.muzioai.app.ACTION_CLOSE";

    private static final String NOTIF_CHANNEL_ID = "muzio_playback";
    static final int             NOTIF_ID         = 7001;

    // Visible to the plugin so it knows whether to use startForegroundService()
    static volatile boolean isRunning = false;

    private NotificationManager notifMgr;
    private MediaSession        mediaSession;

    // ── Lifecycle ────────────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        isRunning = true;
        notifMgr  = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        ensureChannel();
        ensureMediaSession();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_HIDE.equals(intent.getAction())) {
            stopSelf();
            return START_NOT_STICKY;
        }
        // ACTION_UPDATE (or null = re-delivery after process restart)
        String  title   = intent != null ? intent.getStringExtra("title")   : "";
        String  artist  = intent != null ? intent.getStringExtra("artist")  : "";
        String  album   = intent != null ? intent.getStringExtra("album")   : "";
        String  art     = intent != null ? intent.getStringExtra("art")     : "";
        boolean playing = intent != null && intent.getBooleanExtra("playing", false);
        updateForeground(
            title   != null ? title   : "",
            artist  != null ? artist  : "",
            album   != null ? album   : "",
            art     != null ? art     : "",
            playing
        );
        return START_STICKY;
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
        ch.setDescription("Muzio AI playback controls");
        ch.setShowBadge(false);
        ch.setSound(null, null);
        notifMgr.createNotificationChannel(ch);
    }

    private void ensureMediaSession() {
        if (mediaSession != null) return;
        try {
            mediaSession = new MediaSession(this, "MuzioAI");
            // FLAG_HANDLES_MEDIA_BUTTONS throws IllegalArgumentException on API 34+
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
                //noinspection deprecation
                mediaSession.setFlags(
                    MediaSession.FLAG_HANDLES_MEDIA_BUTTONS |
                    MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
            }
            // Callback required on API 34+ for the session to be considered active;
            // routes hardware/Bluetooth button presses to the WebView via broadcasts
            mediaSession.setCallback(new MediaSession.Callback() {
                @Override public void onPlay()           { broadcast(ACTION_PLAY_PAUSE); }
                @Override public void onPause()          { broadcast(ACTION_PLAY_PAUSE); }
                @Override public void onSkipToNext()     { broadcast(ACTION_NEXT); }
                @Override public void onSkipToPrevious() { broadcast(ACTION_PREV); }
                @Override public void onStop()           { broadcast(ACTION_CLOSE); }
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

    // ── Core notification update ─────────────────────────────────────────────

    private void updateForeground(String title, String artist, String album,
                                  String artData, boolean playing) {
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
                if (artBmp != null) {
                    meta.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART,    artBmp)
                        .putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, artBmp);
                }
                mediaSession.setMetadata(meta.build());

                long actions = PlaybackState.ACTION_PLAY
                             | PlaybackState.ACTION_PAUSE
                             | PlaybackState.ACTION_SKIP_TO_NEXT
                             | PlaybackState.ACTION_SKIP_TO_PREVIOUS
                             | PlaybackState.ACTION_STOP;
                mediaSession.setPlaybackState(new PlaybackState.Builder()
                    .setActions(actions)
                    .setState(
                        playing ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                        PlaybackState.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                    .build());
            } catch (Exception e) {
                Log.e(TAG, "MediaSession update: " + e.getMessage(), e);
            }
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
          .setContentTitle(title.isEmpty() ? "Muzio AI" : title)
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
