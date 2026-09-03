package com.muzioai.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.graphics.Bitmap;
import android.graphics.Color;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.os.PowerManager;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import com.google.zxing.BarcodeFormat;
import com.google.zxing.common.BitMatrix;
import com.google.zxing.qrcode.QRCodeWriter;

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;
import org.jaudiotagger.tag.images.ArtworkFactory;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.ServerSocket;
import java.net.Socket;
import java.net.SocketTimeoutException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@CapacitorPlugin(
    name = "MediaStore",
    // Capacitor routes an activity result to a plugin by looking the request code up in
    // this list (Bridge.getPluginWithRequestCode). It defaults to empty, so without these
    // entries handleOnActivityResult below was never called: every flow that shows a
    // system dialog — deleting a file, granting tag-write access, picking the SD card —
    // left its PluginCall alive and unanswered, and the JS promise waited for ever.
    // Must stay in sync with the request code constants declared below.
    requestCodes = { 9001, 9002, 9003, 9005 },
    permissions = {
        @Permission(alias = "audioApi33",       strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "audioLegacy",      strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
        @Permission(alias = "writeStorage",     strings = { "android.permission.WRITE_EXTERNAL_STORAGE" }),
        @Permission(alias = "postNotifications",strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class MediaStorePlugin extends Plugin {

    private static final String TAG                    = "MediaStorePlugin";
    private static final int    WRITE_REQUEST_CODE        = 9001;
    private static final int    SAF_REQUEST_CODE          = 9002;
    private static final int    WRITE_ACCESS_REQUEST_CODE = 9003;
    private static final int    DELETE_REQUEST_CODE       = 9005;
    private static final String PREFS_NAME             = "muzio_prefs";
    private static final String PREF_SAF_URI           = "saf_tree_uri";

    // Broadcast actions — must match MuzioPlaybackService constants
    private static final String ACTION_PREV       = "com.muzioai.app.ACTION_PREV";
    private static final String ACTION_PLAY_PAUSE = "com.muzioai.app.ACTION_PLAY_PAUSE";
    private static final String ACTION_NEXT       = "com.muzioai.app.ACTION_NEXT";
    private static final String ACTION_CLOSE      = "com.muzioai.app.ACTION_CLOSE";
    private static final String ACTION_SEEK       = "com.muzioai.app.ACTION_SEEK";
    private static final String ACTION_FOCUS_LOST = "com.muzioai.app.ACTION_FOCUS_LOST";
    private static final String ACTION_FOCUS_GAIN = "com.muzioai.app.ACTION_FOCUS_GAIN";

    // Saved state for async activity callbacks
    private PluginCall savedWriteCall;
    private Uri        pendingWriteUri;
    private PluginCall savedSafCall;
    private PluginCall savedWriteAccessCall;
    private PluginCall savedDeleteCall;
    private List<Uri>  pendingDeleteUris;
    // Android 10 only: the consent dialog grants permission but does not delete,
    // so the delete has to be retried once the user has approved it.
    private boolean    pendingDeleteNeedsRetry = false;

    // WiFi file-share server state
    private ServerSocket fileServer;
    private volatile boolean fileServerActive = false;

    // ─── Notification button receiver ─────────────────────────────────────────
    // Receives ACTION_PREV/PLAY_PAUSE/NEXT/CLOSE from MuzioPlaybackService
    // and dispatches the corresponding JS event to the WebView.
    private BroadcastReceiver notifReceiver;
    private boolean           receiverRegistered = false;

    // Silence jaudiotagger's overly verbose logging
    static {
        Logger.getLogger("org.jaudiotagger").setLevel(Level.SEVERE);
    }

    // ─── Read permission helpers ───────────────────────────────────────────────

    private boolean hasAudioPermission() {
        if (Build.VERSION.SDK_INT >= 33) {
            return getPermissionState("audioApi33") == PermissionState.GRANTED;
        } else {
            return getPermissionState("audioLegacy") == PermissionState.GRANTED;
        }
    }

    @PluginMethod
    public void getAllAudioFiles(PluginCall call) {
        if (!hasAudioPermission()) {
            if (Build.VERSION.SDK_INT >= 33) {
                requestPermissionForAlias("audioApi33", call, "audioPermissionCallback");
            } else {
                requestPermissionForAlias("audioLegacy", call, "audioPermissionCallback");
            }
            return;
        }
        doQuery(call);
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        if (hasAudioPermission()) {
            doQuery(call);
        } else {
            call.reject("Permission denied — go to Settings → Apps → My Music → Permissions → Files and media");
        }
    }

    // ─── Utility plugin methods ────────────────────────────────────────────────

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", getContext().getPackageName(), null));
        getActivity().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void exitApp(PluginCall call) {
        call.resolve();
        getActivity().finishAffinity();
    }

    /**
     * The clipboard's text.
     *
     * navigator.clipboard.readText() is not implemented in an Android WebView,
     * so the only way for the app to see what was copied is to ask Android.
     * Reading it is what lets the key setup screen say "what you copied is a
     * link, not the key" instead of leaving someone to paste blind.
     */
    @PluginMethod
    public void readClipboard(PluginCall call) {
        try {
            ClipboardManager cm = (ClipboardManager) getContext()
                .getSystemService(Context.CLIPBOARD_SERVICE);
            String text = "";
            if (cm != null && cm.hasPrimaryClip()) {
                ClipData clip = cm.getPrimaryClip();
                if (clip != null && clip.getItemCount() > 0) {
                    CharSequence cs = clip.getItemAt(0).coerceToText(getContext());
                    if (cs != null) text = cs.toString();
                }
            }
            JSObject r = new JSObject();
            r.put("text", text);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read the clipboard: " + e.getMessage());
        }
    }

    /** The installed version, so the app can tell whether a release is newer than itself. */
    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            android.content.pm.PackageInfo info = getContext().getPackageManager()
                .getPackageInfo(getContext().getPackageName(), 0);
            long code = (Build.VERSION.SDK_INT >= 28)
                ? info.getLongVersionCode()
                : (long) info.versionCode;
            JSObject r = new JSObject();
            r.put("versionName", info.versionName == null ? "" : info.versionName);
            r.put("versionCode", code);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Could not read app version: " + e.getMessage());
        }
    }

    /**
     * Hand a URL to the browser. The WebView registers no DownloadListener, so an APK
     * link opened inside it goes nowhere; the browser has to do the downloading.
     */
    @PluginMethod
    public void openExternal(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !(url.startsWith("https://") || url.startsWith("http://"))) {
            call.reject("Refusing to open a non-http(s) URL");
            return;
        }
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Could not open the link: " + e.getMessage());
        }
    }

    /**
     * Writes a text file into the public Downloads folder.
     *
     * The WebView has no DownloadListener, so an <a download> pointing at a blob
     * URL is silently discarded — backups and playlist exports never reached the
     * filesystem. Writing through MediaStore puts the file somewhere the user can
     * actually find it, and returns the path so the UI can say where it went.
     */
    @PluginMethod
    public void saveToDownloads(PluginCall call) {
        String fileName = call.getString("fileName", "");
        String text     = call.getString("text", "");
        String mime     = call.getString("mimeType", "text/plain");
        if (fileName == null || fileName.isEmpty()) { call.reject("No fileName"); return; }
        if (text == null) text = "";
        if (mime == null || mime.isEmpty()) mime = "text/plain";

        try {
            byte[] bytes = text.getBytes(StandardCharsets.UTF_8);
            ContentResolver cr = getContext().getContentResolver();
            String shownPath = "Downloads/" + fileName;

            if (Build.VERSION.SDK_INT >= 29) {
                ContentValues cv = new ContentValues();
                cv.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                cv.put(MediaStore.Downloads.MIME_TYPE,    mime);
                cv.put(MediaStore.Downloads.IS_PENDING,   1);
                Uri outUri = cr.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                if (outUri == null) { call.reject("Could not create file in Downloads"); return; }
                try (OutputStream os = cr.openOutputStream(outUri)) {
                    if (os == null) { call.reject("Could not open Downloads file"); return; }
                    os.write(bytes);
                }
                cv.clear();
                cv.put(MediaStore.Downloads.IS_PENDING, 0);
                cr.update(outUri, cv, null, null);
            } else {
                File dir = android.os.Environment.getExternalStoragePublicDirectory(
                    android.os.Environment.DIRECTORY_DOWNLOADS);
                if (!dir.exists() && !dir.mkdirs()) { call.reject("Could not open Downloads folder"); return; }
                File out = new File(dir, fileName);
                try (FileOutputStream fos = new FileOutputStream(out)) { fos.write(bytes); }
                // Make it visible to file managers straight away
                MediaScannerConnection.scanFile(
                    getContext(), new String[]{ out.getAbsolutePath() }, new String[]{ mime }, null);
                shownPath = out.getAbsolutePath();
            }

            JSObject r = new JSObject();
            r.put("path", shownPath);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Save failed: " + e.getMessage());
        }
    }

    // ─── Album art reading ─────────────────────────────────────────────────────

    @PluginMethod
    public void readAlbumArt(PluginCall call) {
        String uriStr = call.getString("uri", "");
        int reqSize = call.getInt("size", 192);
        if (reqSize < 48)   reqSize = 48;
        if (reqSize > 1200) reqSize = 1200;
        if (uriStr == null || uriStr.isEmpty()) { call.reject("No uri"); return; }
        try {
            Uri artUri = Uri.parse(uriStr);
            InputStream is = getContext().getContentResolver().openInputStream(artUri);
            if (is == null) { call.reject("null stream"); return; }
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inSampleSize = 1; // avoid upscaling blur from premature sub-sampling
            android.graphics.Bitmap bmp;
            try {
                bmp = android.graphics.BitmapFactory.decodeStream(is, null, opts);
            } finally {
                try { is.close(); } catch (Exception ignored) {}
            }
            if (bmp == null) { call.reject("decode failed"); return; }
            android.graphics.Bitmap scaled;
            try {
                scaled = android.graphics.Bitmap.createScaledBitmap(bmp, reqSize, reqSize, true);
            } catch (OutOfMemoryError oom) {
                bmp.recycle();
                call.reject("OOM scaling bitmap");
                return;
            }
            if (scaled != bmp) bmp.recycle();
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            int quality = reqSize <= 256 ? 78 : 90;
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, quality, baos);
            scaled.recycle();
            String b64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("data", "data:image/jpeg;base64," + b64);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("readAlbumArt: " + e.getMessage());
        }
    }

    // ─── SAF (Storage Access Framework) for portable SD card ──────────────────

    /**
     * Launches the Android folder picker so the user can grant persistent write
     * access to their portable SD card.  The chosen tree URI is stored in
     * SharedPreferences and reused for all subsequent SD card writes.
     */
    @PluginMethod
    public void requestSdCardAccess(PluginCall call) {
        savedSafCall = call;
        call.setKeepAlive(true);
        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        intent.addFlags(
            Intent.FLAG_GRANT_READ_URI_PERMISSION  |
            Intent.FLAG_GRANT_WRITE_URI_PERMISSION |
            Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION
        );
        getActivity().startActivityForResult(intent, SAF_REQUEST_CODE);
    }

    /** Returns the stored SAF tree URI string, or null if not yet granted. */
    @PluginMethod
    public void getSdCardTreeUri(PluginCall call) {
        String uri = getContext()
                       .getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                       .getString(PREF_SAF_URI, null);
        JSObject result = new JSObject();
        result.put("treeUri", uri != null ? uri : "");
        call.resolve(result);
    }

    // ─── Batch write consent (Android 11+) ────────────────────────────────────

    /**
     * Asks the user ONCE for write access to a whole batch of MediaStore audio
     * URIs via MediaStore.createWriteRequest, instead of one system dialog per
     * file from the RecoverableSecurityException path in writeFileTags.
     * Resolves { granted: true|false }. On Android < 11 (no batch API) it
     * resolves granted=true and the legacy per-file flow handles consent.
     */
    @PluginMethod
    public void requestWriteAccess(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
            JSObject r = new JSObject();
            r.put("granted", true);
            call.resolve(r);
            return;
        }
        JSArray arr = call.getArray("uris");
        if (arr == null || arr.length() == 0) { call.reject("No uris"); return; }
        List<Uri> uris = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                String u = arr.getString(i);
                if (u != null && !u.isEmpty()) uris.add(Uri.parse(u));
            }
        } catch (Exception e) {
            call.reject("Bad uris: " + e.getMessage());
            return;
        }
        if (uris.isEmpty()) { call.reject("No uris"); return; }
        try {
            PendingIntent pi = MediaStore.createWriteRequest(getContext().getContentResolver(), uris);
            if (savedWriteAccessCall != null) {
                savedWriteAccessCall.setKeepAlive(false);
                savedWriteAccessCall.reject("Superseded by a newer request");
            }
            savedWriteAccessCall = call;
            call.setKeepAlive(true);
            getActivity().startIntentSenderForResult(
                pi.getIntentSender(), WRITE_ACCESS_REQUEST_CODE, null, 0, 0, 0, null);
        } catch (Exception e) {
            call.reject("createWriteRequest: " + e.getMessage());
        }
    }

    // ─── Haptic vibration ─────────────────────────────────────────────────────

    @PluginMethod
    public void vibrate(PluginCall call) {
        int duration = call.getInt("duration", 50);
        try {
            if (Build.VERSION.SDK_INT >= 31) {
                android.os.VibratorManager vm = (android.os.VibratorManager)
                    getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    android.os.Vibrator v = vm.getDefaultVibrator();
                    v.vibrate(android.os.VibrationEffect.createOneShot(duration, 255));
                }
            } else if (Build.VERSION.SDK_INT >= 26) {
                android.os.Vibrator v = (android.os.Vibrator)
                    getContext().getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(android.os.VibrationEffect.createOneShot(duration, 255));
            } else {
                android.os.Vibrator v = (android.os.Vibrator)
                    getContext().getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) v.vibrate(duration);
            }
            call.resolve();
        } catch (Exception e) {
            call.resolve(); // vibration is best-effort
        }
    }

    // ─── Tag writing ──────────────────────────────────────────────────────────

    @PluginMethod
    public void writeFileTags(PluginCall call) {
        String uriStr = call.getString("contentUri", "");
        if (uriStr == null || uriStr.isEmpty()) { call.reject("No contentUri"); return; }
        Uri uri = Uri.parse(uriStr);

        // Android < 10: need legacy WRITE_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
                    && getPermissionState("writeStorage") != PermissionState.GRANTED) {
                requestPermissionForAlias("writeStorage", call, "writeStoragePermissionCallback");
                return;
            }
            try {
                doWriteFileTags(call, uri);
            } catch (Exception e) {
                call.reject("writeFileTags: " + e.getMessage());
            }
            return;
        }

        // Android 10+: try directly; catch RecoverableSecurityException for internal storage
        call.setKeepAlive(true);
        try {
            doWriteFileTags(call, uri);
        } catch (android.app.RecoverableSecurityException rse) {
            if (savedWriteCall != null) {
                savedWriteCall.setKeepAlive(false);
                savedWriteCall.reject("Cancelled by concurrent write");
            }
            savedWriteCall = call;
            pendingWriteUri = uri;
            try {
                getActivity().startIntentSenderForResult(
                    rse.getUserAction().getActionIntent().getIntentSender(),
                    WRITE_REQUEST_CODE, null, 0, 0, 0, null);
            } catch (Exception e) {
                call.setKeepAlive(false);
                call.reject("Could not launch permission dialog: " + e.getMessage());
            }
        } catch (Exception e) {
            call.setKeepAlive(false);
            call.reject("writeFileTags: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void writeStoragePermissionCallback(PluginCall call) {
        if (getPermissionState("writeStorage") != PermissionState.GRANTED) {
            call.reject("Write permission denied");
            return;
        }
        String uriStr = call.getString("contentUri", "");
        if (uriStr == null || uriStr.isEmpty()) { call.reject("No contentUri"); return; }
        try {
            doWriteFileTags(call, Uri.parse(uriStr));
        } catch (Exception e) {
            call.reject("writeFileTags: " + e.getMessage());
        }
    }

    // ─── Share audio files ─────────────────────────────────────────────────────

    /**
     * Opens the Android share sheet for one or more audio files by content URI.
     * Quick Share, Bluetooth, and any installed app that handles audio/* appear in the sheet.
     */
    @PluginMethod
    public void shareFiles(PluginCall call) {
        JSArray urisArr = call.getArray("uris");
        String chooserTitle = call.getString("title", "Share Music");
        if (urisArr == null || urisArr.length() == 0) { call.reject("No uris"); return; }
        ArrayList<Uri> uris = new ArrayList<>();
        try {
            for (int i = 0; i < urisArr.length(); i++) {
                String u = urisArr.getString(i);
                if (u != null && !u.isEmpty()) uris.add(Uri.parse(u));
            }
        } catch (Exception e) { call.reject("Bad uris: " + e.getMessage()); return; }
        if (uris.isEmpty()) { call.reject("No uris"); return; }

        Intent shareIntent;
        if (uris.size() == 1) {
            shareIntent = new Intent(Intent.ACTION_SEND);
            shareIntent.setType("audio/*");
            shareIntent.putExtra(Intent.EXTRA_STREAM, uris.get(0));
        } else {
            shareIntent = new Intent(Intent.ACTION_SEND_MULTIPLE);
            shareIntent.setType("audio/*");
            shareIntent.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris);
        }
        shareIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(Intent.createChooser(shareIntent, chooserTitle));
            call.resolve();
        } catch (Exception e) {
            call.reject("Share failed: " + e.getMessage());
        }
    }

    // ─── QR code generation ────────────────────────────────────────────────────

    /**
     * Generates a QR code for the given text and returns it as a base64 PNG data URL.
     * Works fully offline — uses ZXing, no network required.
     */
    @PluginMethod
    public void generateQrCode(PluginCall call) {
        String text = call.getString("text", "");
        int size = call.getInt("size", 300);
        if (text == null || text.isEmpty()) { call.reject("No text"); return; }
        try {
            QRCodeWriter writer = new QRCodeWriter();
            BitMatrix matrix = writer.encode(text, BarcodeFormat.QR_CODE, size, size);
            Bitmap bmp = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            for (int x = 0; x < size; x++) {
                for (int y = 0; y < size; y++) {
                    bmp.setPixel(x, y, matrix.get(x, y) ? Color.BLACK : Color.WHITE);
                }
            }
            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            bmp.compress(Bitmap.CompressFormat.PNG, 100, baos);
            bmp.recycle();
            JSObject r = new JSObject();
            r.put("data", "data:image/png;base64," + Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP));
            call.resolve(r);
        } catch (Exception e) {
            call.reject("QR generation failed: " + e.getMessage());
        }
    }

    // ─── Local WiFi file-share server ─────────────────────────────────────────
    /**
     * Starts a temporary HTTP server on the local WiFi so another device on the same
     * network can download the song(s) by scanning a QR code.
     *
     * Accepts: { songs: [{contentUri, fileName}] }
     * Returns: { url: "http://192.168.x.x:PORT/" } or rejects if not on WiFi.
     *
     * Single song  → GET /fileName    → downloads the audio file.
     * Multiple songs → GET /          → HTML download index; each file served at /fileName.
     */
    @PluginMethod
    public void startShareServer(PluginCall call) {
        JSArray arr = call.getArray("songs");
        if (arr == null || arr.length() == 0) { call.reject("No songs"); return; }

        // Build list of {uri, name} pairs
        final List<Uri>    uris  = new ArrayList<>();
        final List<String> names = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                org.json.JSONObject obj = arr.getJSONObject(i);
                uris.add(Uri.parse(obj.getString("contentUri")));
                names.add(sanitizeName(obj.getString("fileName")));
            }
        } catch (Exception e) { call.reject("Bad songs array: " + e.getMessage()); return; }

        String ip = getLocalIpAddress();
        if (ip == null) { call.reject("Not connected to WiFi"); return; }

        stopFileServerInternal();

        try {
            fileServer = new ServerSocket(0);
            int port = fileServer.getLocalPort();
            fileServerActive = true;

            final boolean single = uris.size() == 1;

            Thread t = new Thread(() -> {
                ServerSocket srv = fileServer; // local copy — avoids NPE if stopFileServerInternal races
                if (srv == null) return;
                try {
                    srv.setSoTimeout(600000); // 10-min window
                    while (fileServerActive && !srv.isClosed()) {
                        try {
                            Socket client = srv.accept();
                            serveClient(client, uris, names, single);
                        } catch (SocketTimeoutException ignored) {
                            break;
                        } catch (Exception e) {
                            if (!fileServerActive || srv.isClosed()) break;
                        }
                    }
                } catch (Exception ignored) {
                } finally { stopFileServerInternal(); }
            });
            t.setDaemon(true);
            t.start();

            String rootUrl = "http://" + ip + ":" + port + "/" + (single ? Uri.encode(names.get(0)) : "");
            JSObject r = new JSObject();
            r.put("url", rootUrl);
            call.resolve(r);
        } catch (Exception e) {
            call.reject("Server start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stopShareServer(PluginCall call) {
        stopFileServerInternal();
        if (call != null) call.resolve();
    }

    private void stopFileServerInternal() {
        fileServerActive = false;
        if (fileServer != null) {
            try { fileServer.close(); } catch (Exception ignored) {}
            fileServer = null;
        }
    }

    private void serveClient(Socket client, List<Uri> uris, List<String> names, boolean single) {
        try {
            client.setSoTimeout(30000);
            BufferedInputStream req = new BufferedInputStream(client.getInputStream());
            // Read the request line (first line only)
            StringBuilder requestLine = new StringBuilder();
            int b;
            while ((b = req.read()) != -1 && b != '\r' && b != '\n') requestLine.append((char) b);
            // Drain remaining headers
            int prev = -1;
            while ((b = req.read()) != -1) {
                if (prev == '\n' && b == '\r') { req.read(); break; } // \n\r\n → end of headers
                prev = b;
            }

            String path = "";
            String[] parts = requestLine.toString().split(" ");
            if (parts.length >= 2) path = parts[1].replaceFirst("^/", "");
            path = java.net.URLDecoder.decode(path, "UTF-8");

            OutputStream out = new BufferedOutputStream(client.getOutputStream(), 65536);
            ContentResolver cr = getContext().getContentResolver();

            if (single || !path.isEmpty()) {
                // Serve specific file
                int idx = names.indexOf(path);
                Uri uri = idx >= 0 ? uris.get(idx) : (single ? uris.get(0) : null);
                String name = idx >= 0 ? names.get(idx) : (single ? names.get(0) : null);
                if (uri == null) {
                    out.write("HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\n\r\n".getBytes());
                    out.flush(); return;
                }
                long size = getContentLength(cr, uri);
                String headers = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: " + mimeFromName(name) + "\r\n"
                    + (size > 0 ? "Content-Length: " + size + "\r\n" : "")
                    + "Content-Disposition: attachment; filename=\"" + name + "\"\r\n"
                    + "Connection: close\r\n\r\n";
                out.write(headers.getBytes(StandardCharsets.UTF_8));
                InputStream fis = cr.openInputStream(uri);
                if (fis != null) {
                    byte[] buf = new byte[65536];
                    int read;
                    while ((read = fis.read(buf)) != -1) out.write(buf, 0, read);
                    fis.close();
                }
            } else {
                // Serve all songs as a single ZIP download
                String zipHeaders = "HTTP/1.1 200 OK\r\n"
                    + "Content-Type: application/zip\r\n"
                    + "Content-Disposition: attachment; filename=\"MyMusic-Album.zip\"\r\n"
                    + "Connection: close\r\n\r\n";
                out.write(zipHeaders.getBytes(StandardCharsets.UTF_8));
                out.flush();
                ZipOutputStream zos = new ZipOutputStream(out);
                byte[] buf = new byte[65536];
                for (int i = 0; i < uris.size(); i++) {
                    try {
                        InputStream fis = cr.openInputStream(uris.get(i));
                        if (fis == null) continue;
                        zos.putNextEntry(new ZipEntry(names.get(i)));
                        try {
                            int read;
                            while ((read = fis.read(buf)) != -1) zos.write(buf, 0, read);
                        } finally {
                            fis.close();
                            zos.closeEntry(); // always close entry so ZIP central directory stays consistent
                        }
                    } catch (Exception e) {
                        Log.w(TAG, "ZIP entry failed: " + e.getMessage());
                    }
                }
                zos.finish();
            }
            out.flush();
        } catch (Exception e) {
            Log.w(TAG, "serveClient: " + e.getMessage());
        } finally {
            try { client.close(); } catch (Exception ignored) {}
        }
    }

    private long getContentLength(ContentResolver cr, Uri uri) {
        try (android.database.Cursor c = cr.query(uri,
                new String[]{MediaStore.Audio.Media.SIZE}, null, null, null)) {
            if (c != null && c.moveToFirst()) return c.getLong(0);
        } catch (Exception ignored) {}
        return -1;
    }

    private String sanitizeName(String name) {
        return name.replaceAll("[^a-zA-Z0-9._\\- ]", "_");
    }

    private String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> ifaces = NetworkInterface.getNetworkInterfaces();
            if (ifaces == null) return null;
            while (ifaces.hasMoreElements()) {
                NetworkInterface iface = ifaces.nextElement();
                if (!iface.isUp() || iface.isLoopback()) continue;
                Enumeration<InetAddress> addrs = iface.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress addr = addrs.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        String ip = addr.getHostAddress();
                        if (ip != null && (ip.startsWith("192.168.") || ip.startsWith("10.") || isPrivate172(ip)))
                            return ip;
                    }
                }
            }
        } catch (Exception ignored) {}
        return null;
    }

    private boolean isPrivate172(String ip) {
        if (!ip.startsWith("172.")) return false;
        try {
            int second = Integer.parseInt(ip.split("\\.")[1]);
            return second >= 16 && second <= 31;
        } catch (Exception e) { return false; }
    }

    private String mimeFromName(String name) {
        if (name == null) return "audio/mpeg";
        String lower = name.toLowerCase();
        if (lower.endsWith(".flac")) return "audio/flac";
        if (lower.endsWith(".m4a") || lower.endsWith(".aac")) return "audio/mp4";
        if (lower.endsWith(".ogg") || lower.endsWith(".opus")) return "audio/ogg";
        if (lower.endsWith(".wav")) return "audio/wav";
        if (lower.endsWith(".wma")) return "audio/x-ms-wma";
        return "audio/mpeg";
    }

    // ─── Permanent file deletion ───────────────────────────────────────────────

    /**
     * Permanently deletes audio files from the device by their MediaStore content URIs.
     * Android 10+: shows a system confirmation dialog via MediaStore.createDeleteRequest.
     * Android < 10: deletes directly (requires WRITE_EXTERNAL_STORAGE permission).
     * Resolves { deleted: N } or rejects on cancellation / error.
     */
    @PluginMethod
    public void deleteFiles(PluginCall call) {
        JSArray arr = call.getArray("uris");
        if (arr == null || arr.length() == 0) { call.reject("No uris"); return; }
        List<Uri> uris = new ArrayList<>();
        try {
            for (int i = 0; i < arr.length(); i++) {
                String u = arr.getString(i);
                if (u != null && !u.isEmpty()) uris.add(Uri.parse(u));
            }
        } catch (Exception e) {
            call.reject("Bad uris: " + e.getMessage());
            return;
        }
        if (uris.isEmpty()) { call.reject("No uris"); return; }

        ContentResolver cr = getContext().getContentResolver();

        // createDeleteRequest is API 30, not 29 — guarding on Q called a method that
        // does not exist on Android 10 and threw NoSuchMethodError, which is an Error
        // and so slipped past the catch below.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // Android 11+: one system confirmation dialog deletes the whole batch
            try {
                PendingIntent pi = MediaStore.createDeleteRequest(cr, uris);
                if (savedDeleteCall != null) {
                    savedDeleteCall.setKeepAlive(false);
                    savedDeleteCall.reject("Superseded by newer delete");
                }
                savedDeleteCall = call;
                pendingDeleteUris = uris;
                pendingDeleteNeedsRetry = false; // the system performs the delete itself
                call.setKeepAlive(true);
                getActivity().startIntentSenderForResult(
                    pi.getIntentSender(), DELETE_REQUEST_CODE, null, 0, 0, 0, null);
            } catch (Exception e) {
                call.reject("createDeleteRequest: " + e.getMessage());
            }
            return;
        }

        if (Build.VERSION.SDK_INT == Build.VERSION_CODES.Q) {
            deleteWithConsentQ(call, cr, uris);
            return;
        }

        // Android 9 and below: WRITE_EXTERNAL_STORAGE covers it
        int deleted = 0;
        for (Uri uri : uris) {
            try { deleted += cr.delete(uri, null, null); } catch (Exception ignored) {}
        }
        finishDelete(call, deleted);
    }

    /**
     * Android 10 delete path, kept in its own method so RecoverableSecurityException
     * (API 29) is never referenced by a method that also runs on older devices.
     *
     * Files owned by another app throw RecoverableSecurityException, which carries a
     * consent dialog. Showing it only grants permission, so the delete is retried in
     * handleOnActivityResult once the user approves.
     */
    @androidx.annotation.RequiresApi(Build.VERSION_CODES.Q)
    private void deleteWithConsentQ(PluginCall call, ContentResolver cr, List<Uri> uris) {
        int deleted = 0;
        android.app.RecoverableSecurityException needsConsent = null;
        for (Uri uri : uris) {
            try {
                deleted += cr.delete(uri, null, null);
            } catch (android.app.RecoverableSecurityException rse) {
                if (needsConsent == null) needsConsent = rse;
            } catch (Exception ignored) {}
        }
        if (needsConsent == null) { finishDelete(call, deleted); return; }
        try {
            if (savedDeleteCall != null) {
                savedDeleteCall.setKeepAlive(false);
                savedDeleteCall.reject("Superseded by newer delete");
            }
            savedDeleteCall = call;
            pendingDeleteUris = uris;
            pendingDeleteNeedsRetry = true; // consent alone does not delete anything
            call.setKeepAlive(true);
            getActivity().startIntentSenderForResult(
                needsConsent.getUserAction().getActionIntent().getIntentSender(),
                DELETE_REQUEST_CODE, null, 0, 0, 0, null);
        } catch (Exception e) {
            call.reject("Delete permission request failed: " + e.getMessage());
        }
    }

    /**
     * Report the real count. Claiming success on a failed delete would strand the file
     * on disk while the library forgot about it, and the next scan would bring it
     * straight back as a ghost entry.
     */
    private void finishDelete(PluginCall call, int deleted) {
        if (deleted == 0) { call.reject("Could not delete the file"); return; }
        JSObject r = new JSObject();
        r.put("deleted", deleted);
        call.resolve(r);
    }

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

        if (requestCode == WRITE_ACCESS_REQUEST_CODE) {
            PluginCall call = savedWriteAccessCall;
            savedWriteAccessCall = null;
            if (call == null) return;
            call.setKeepAlive(false);
            JSObject r = new JSObject();
            r.put("granted", resultCode == Activity.RESULT_OK);
            call.resolve(r);
            return;
        }

        if (requestCode == DELETE_REQUEST_CODE) {
            PluginCall call  = savedDeleteCall;
            List<Uri> uris   = pendingDeleteUris;
            boolean   retry  = pendingDeleteNeedsRetry;
            savedDeleteCall = null;
            pendingDeleteUris = null;
            pendingDeleteNeedsRetry = false;
            if (call == null) return;
            call.setKeepAlive(false);
            if (resultCode != Activity.RESULT_OK) { call.reject("Delete cancelled"); return; }

            int deleted;
            if (retry) {
                // Android 10: consent granted, now actually delete
                deleted = 0;
                ContentResolver cr2 = getContext().getContentResolver();
                if (uris != null) {
                    for (Uri uri : uris) {
                        try { deleted += cr2.delete(uri, null, null); } catch (Exception ignored) {}
                    }
                }
                if (deleted == 0) { call.reject("Could not delete the file"); return; }
            } else {
                // Android 11+: the system already removed them
                deleted = uris != null ? uris.size() : 0;
            }
            JSObject r = new JSObject();
            r.put("deleted", deleted);
            call.resolve(r);
            return;
        }

        if (requestCode == SAF_REQUEST_CODE) {
            PluginCall safCall = savedSafCall;
            savedSafCall = null;
            if (safCall == null) return;
            safCall.setKeepAlive(false);

            if (resultCode == Activity.RESULT_OK && data != null && data.getData() != null) {
                Uri treeUri = data.getData();
                int flags = Intent.FLAG_GRANT_READ_URI_PERMISSION
                          | Intent.FLAG_GRANT_WRITE_URI_PERMISSION;
                try {
                    getContext().getContentResolver().takePersistableUriPermission(treeUri, flags);
                } catch (Exception e) {
                    Log.w(TAG, "takePersistableUriPermission: " + e.getMessage());
                }
                getContext().getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
                            .edit()
                            .putString(PREF_SAF_URI, treeUri.toString())
                            .apply();
                JSObject result = new JSObject();
                result.put("success", true);
                result.put("treeUri", treeUri.toString());
                safCall.resolve(result);
            } else {
                safCall.reject("SD card access denied or cancelled");
            }
            return;
        }

        if (requestCode == WRITE_REQUEST_CODE) {
            PluginCall call = savedWriteCall;
            Uri uri = pendingWriteUri;
            savedWriteCall = null;
            pendingWriteUri = null;
            if (call == null) return;
            call.setKeepAlive(false);
            if (resultCode == Activity.RESULT_OK) {
                try {
                    doWriteFileTags(call, uri);
                } catch (Exception e) {
                    call.reject("writeFileTags (post-permission): " + e.getMessage());
                }
            } else {
                call.reject("User denied write permission");
            }
        }
    }

    // ─── Core tag-write logic (jaudiotagger) ──────────────────────────────────

    /**
     * Writes tags to a music file using jaudiotagger.
     * Supports MP3, FLAC, M4A/AAC, OGG, and WAV.
     * Uses SAF for portable SD card files; MediaStore URI for internal storage.
     */
    private void doWriteFileTags(PluginCall call, Uri mediaUri) throws Exception {
        Context ctx = getContext();
        ContentResolver resolver = ctx.getContentResolver();

        String title       = nvl(call.getString("title",       ""));
        String artist      = nvl(call.getString("artist",      ""));
        String album       = nvl(call.getString("album",       ""));
        String year        = nvl(call.getString("year",        ""));
        String genre       = nvl(call.getString("genre",       ""));
        String albumArtist = nvl(call.getString("albumArtist", ""));
        String track       = nvl(call.getString("track",       ""));
        String lyrics      = nvl(call.getString("lyrics",      ""));
        String artBase64   = nvl(call.getString("artBase64",   ""));

        String artMimeType = "image/jpeg";
        byte[] artBytes = null;
        if (!artBase64.isEmpty()) {
            int comma = artBase64.indexOf(',');
            String b64 = comma >= 0 ? artBase64.substring(comma + 1) : artBase64;
            if (artBase64.startsWith("data:") && artBase64.contains(";")) {
                artMimeType = artBase64.substring(5, artBase64.indexOf(';'));
            }
            try { artBytes = Base64.decode(b64, Base64.DEFAULT); } catch (Exception ignored) {}
        }

        // Get real file path (for format detection and SD card check)
        String filePath = getFilePath(mediaUri);
        String ext = "";
        if (!filePath.isEmpty() && filePath.contains(".")) {
            ext = filePath.substring(filePath.lastIndexOf('.') + 1).toLowerCase();
        }
        if (ext.isEmpty()) {
            // Android 10+: DATA column may be null; fall back to DISPLAY_NAME for extension
            String[] proj2 = { MediaStore.Audio.Media.DISPLAY_NAME };
            try (Cursor dc = getContext().getContentResolver().query(mediaUri, proj2, null, null, null)) {
                if (dc != null && dc.moveToFirst()) {
                    String name = dc.getString(0);
                    if (name != null && name.contains(".")) {
                        ext = name.substring(name.lastIndexOf('.') + 1).toLowerCase();
                    }
                }
            } catch (Exception ignored) {}
        }
        if (ext.isEmpty()) ext = "mp3"; // last-resort fallback

        boolean isSdCard = isPortableSdCard(filePath);

        // Copy the source file to a temp file so jaudiotagger has a real File to work with.
        // Use a unique name per call to prevent concurrent writes corrupting each other.
        File tempFile = new File(ctx.getCacheDir(), "muzio_tag_edit_" + java.util.UUID.randomUUID() + "." + ext);
        try {
            // --- Phase 1: Read source → temp file ---
            try (InputStream is = resolver.openInputStream(mediaUri);
                 FileOutputStream fos = new FileOutputStream(tempFile)) {
                if (is == null) throw new Exception("Cannot open source: " + mediaUri);
                pipe(is, fos);
            }

            // --- Phase 2: Modify tags with jaudiotagger ---
            AudioFile audioFile = AudioFileIO.read(tempFile);
            Tag tag = audioFile.getTagOrCreateAndSetDefault();

            if (!title.isEmpty())       tag.setField(FieldKey.TITLE,        title);
            if (!artist.isEmpty())      tag.setField(FieldKey.ARTIST,       artist);
            if (!album.isEmpty())       tag.setField(FieldKey.ALBUM,        album);
            if (!year.isEmpty())        tag.setField(FieldKey.YEAR,         year);
            if (!genre.isEmpty())       tag.setField(FieldKey.GENRE,        genre);
            if (!albumArtist.isEmpty()) tag.setField(FieldKey.ALBUM_ARTIST, albumArtist);
            if (!track.isEmpty())       tag.setField(FieldKey.TRACK,        track);
            if (!lyrics.isEmpty())      tag.setField(FieldKey.LYRICS,       lyrics);

            if (artBytes != null && artBytes.length > 0) {
                Artwork artwork = ArtworkFactory.getNew();
                artwork.setBinaryData(artBytes);
                artwork.setMimeType(artMimeType);
                artwork.setPictureType(3); // front cover
                tag.deleteArtworkField();
                tag.setField(artwork);
            }

            AudioFileIO.write(audioFile); // modifies tempFile in-place

            // --- Phase 3: Write modified temp file back to target ---
            if (isSdCard) {
                writeTempToSdCard(ctx, tempFile, filePath);
            } else {
                // Internal storage: write via MediaStore URI (may throw RecoverableSecurityException)
                // "rwt" = read-write-truncate: opens for writing and truncates to 0 first
                try (FileInputStream fis = new FileInputStream(tempFile);
                     ParcelFileDescriptor pfd = resolver.openFileDescriptor(mediaUri, "rwt")) {
                    if (pfd == null) throw new Exception("Cannot open output descriptor");
                    try (FileOutputStream fos = new FileOutputStream(pfd.getFileDescriptor())) {
                        pipe(fis, fos);
                        fos.getFD().sync();
                    }
                }
            }

            // --- Phase 4: Update MediaStore metadata cache ---
            updateMediaStore(resolver, mediaUri, title, artist, album, year, genre, albumArtist, track);

            // --- Phase 5: Trigger media scanner so all apps see changes ---
            resolver.notifyChange(mediaUri, null);
            if (!filePath.isEmpty()) {
                MediaScannerConnection.scanFile(ctx, new String[]{filePath}, null, null);
            }

            JSObject result = new JSObject();
            result.put("success",     true);
            result.put("fileWritten", true);
            call.setKeepAlive(false);
            call.resolve(result);

        } finally {
            if (tempFile.exists()) tempFile.delete();
        }
    }

    /** Write temp file to SD card using the persisted SAF tree URI. */
    private void writeTempToSdCard(Context ctx, File tempFile, String filePath) throws Exception {
        SharedPreferences prefs = ctx.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        String treeUriStr = prefs.getString(PREF_SAF_URI, null);
        if (treeUriStr == null) {
            throw new Exception("SD_CARD_ACCESS_REQUIRED");
        }
        Uri treeUri = Uri.parse(treeUriStr);

        // Build document URI from file path
        // filePath = "/storage/XXXX-XXXX/Music/Artist/song.mp3"
        // docId    = "XXXX-XXXX:Music/Artist/song.mp3"
        String[] parts = filePath.split("/", 4);
        if (parts.length < 4) throw new Exception("Cannot parse SD card path: " + filePath);
        String volumeId    = parts[2];
        String relativePath = parts[3];
        String docId = volumeId + ":" + relativePath;

        Uri docUri = DocumentsContract.buildDocumentUriUsingTree(treeUri, docId);

        ContentResolver resolver = ctx.getContentResolver();
        try (FileInputStream fis = new FileInputStream(tempFile);
             OutputStream os = resolver.openOutputStream(docUri, "wt")) {
            if (os == null) throw new Exception("Cannot open SAF output stream for: " + filePath);
            pipe(fis, os);
        }
    }

    /** Update MediaStore's cached metadata columns. */
    private void updateMediaStore(ContentResolver resolver, Uri mediaUri,
            String title, String artist, String album, String year,
            String genre, String albumArtist, String track) {
        ContentValues cv = new ContentValues();
        if (!title.isEmpty())  cv.put(MediaStore.Audio.Media.TITLE,  title);
        if (!artist.isEmpty()) cv.put(MediaStore.Audio.Media.ARTIST, artist);
        if (!album.isEmpty())  cv.put(MediaStore.Audio.Media.ALBUM,  album);
        if (!year.isEmpty()) {
            try { cv.put(MediaStore.Audio.Media.YEAR, Integer.parseInt(year)); }
            catch (NumberFormatException ignored) {}
        }
        if (!track.isEmpty()) {
            try { cv.put(MediaStore.Audio.Media.TRACK, Integer.parseInt(track)); }
            catch (NumberFormatException ignored) {}
        }
        if (Build.VERSION.SDK_INT >= 30) {
            if (!genre.isEmpty())       cv.put("genre",        genre);
            if (!albumArtist.isEmpty()) cv.put("album_artist", albumArtist);
        }
        if (cv.size() > 0) {
            try { resolver.update(mediaUri, cv, null, null); } catch (Exception ignored) {}
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Returns the real file path for a MediaStore content URI. */
    private String getFilePath(Uri mediaUri) {
        String[] proj = { MediaStore.Audio.Media.DATA };
        try (Cursor c = getContext().getContentResolver().query(mediaUri, proj, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                String path = c.getString(0);
                return path != null ? path : "";
            }
        } catch (Exception ignored) {}
        return "";
    }

    /**
     * Returns true when the file lives on portable SD card storage.
     * Internal storage paths start with /storage/emulated/; SD card paths don't.
     */
    private boolean isPortableSdCard(String filePath) {
        return filePath != null
            && filePath.startsWith("/storage/")
            && !filePath.startsWith("/storage/emulated/");
    }

    /** Copies all bytes from in to out. */
    private void pipe(java.io.InputStream in, java.io.OutputStream out) throws Exception {
        byte[] buf = new byte[65536];
        int n;
        while ((n = in.read(buf)) != -1) out.write(buf, 0, n);
    }

    private String nvl(String s) { return s == null ? "" : s; }

    // ─── Media notification — delegated to MuzioPlaybackService ──────────────

    /**
     * Ensures the local broadcast receiver is registered so that button presses
     * from the notification (and hardware buttons routed via MediaSession.Callback)
     * are forwarded to the WebView as 'muzioMediaAction' JS events.
     * Registered on the Application context so it survives Activity rotation/pause.
     */
    private void ensureReceiver() {
        if (receiverRegistered) return;
        notifReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context ctx, Intent intent) {
                String action = intent.getAction();
                if (action == null) return;
                final String ev;
                final long seekMs;
                if      (ACTION_PREV.equals(action))       { ev = "prev";      seekMs = -1; }
                else if (ACTION_PLAY_PAUSE.equals(action)) { ev = "playPause"; seekMs = -1; }
                else if (ACTION_NEXT.equals(action))       { ev = "next";      seekMs = -1; }
                else if (ACTION_FOCUS_LOST.equals(action)) { ev = "focusLost"; seekMs = -1; }
                else if (ACTION_FOCUS_GAIN.equals(action)) { ev = "focusGain"; seekMs = -1; }
                else if (ACTION_CLOSE.equals(action)) {
                    stopService();
                    ev = "close"; seekMs = -1;
                } else if (ACTION_SEEK.equals(action)) {
                    ev = "seekTo";
                    seekMs = intent.getLongExtra(MuzioPlaybackService.EXTRA_SEEK_MS, 0L);
                } else return;
                if (getBridge() == null || getBridge().getWebView() == null) return;
                getBridge().getActivity().runOnUiThread(new Runnable() {
                    @Override public void run() {
                        if (getBridge() == null || getBridge().getWebView() == null) return;
                        String js = seekMs >= 0
                            ? "document.dispatchEvent(new CustomEvent('muzioMediaAction'," +
                              "{detail:{action:'seekTo',positionMs:" + seekMs + "}}));"
                            : "document.dispatchEvent(new CustomEvent('muzioMediaAction'," +
                              "{detail:{action:'" + ev + "'}}));";
                        getBridge().getWebView().evaluateJavascript(js, null);
                    }
                });
            }
        };
        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PREV);
        filter.addAction(ACTION_PLAY_PAUSE);
        filter.addAction(ACTION_NEXT);
        filter.addAction(ACTION_CLOSE);
        filter.addAction(ACTION_SEEK);
        filter.addAction(ACTION_FOCUS_LOST);
        filter.addAction(ACTION_FOCUS_GAIN);
        // Use Application context — receiver must outlive Activity (service stays alive)
        Context appCtx = getContext().getApplicationContext();
        if (Build.VERSION.SDK_INT >= 33) {
            appCtx.registerReceiver(notifReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            appCtx.registerReceiver(notifReceiver, filter);
        }
        receiverRegistered = true;
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33
                && getPermissionState("postNotifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("postNotifications", call, "proactiveNotifPermCallback");
        } else {
            call.resolve();
        }
    }

    @PermissionCallback
    private void proactiveNotifPermCallback(PluginCall call) {
        call.resolve();
    }

    @PluginMethod
    public void updateMediaNotification(PluginCall call) {
        // Android 13+: need POST_NOTIFICATIONS before the service can post
        if (Build.VERSION.SDK_INT >= 33
                && getPermissionState("postNotifications") != PermissionState.GRANTED) {
            requestPermissionForAlias("postNotifications", call, "notifPermissionCallback");
            return;
        }
        ensureReceiver();
        sendToService(call);
        call.resolve();
    }

    /**
     * Refresh only where the track is, without touching the artwork.
     *
     * This runs every couple of seconds while playing, so it deliberately does
     * not go through updateMediaNotification: that one carries base64 artwork
     * and decodes a bitmap, which is far too much work to repeat just to move
     * a progress bar.
     */
    @PluginMethod
    public void updatePlaybackPosition(PluginCall call) {
        if (!MuzioPlaybackService.isRunning) { call.resolve(); return; }
        Double posD = call.getDouble("position", 0.0);
        Double durD = call.getDouble("duration", 0.0);
        Double spdD = call.getDouble("speed", 1.0);
        Intent i = new Intent(getContext(), MuzioPlaybackService.class);
        i.setAction(MuzioPlaybackService.ACTION_POSITION);
        i.putExtra("playing",  Boolean.TRUE.equals(call.getBoolean("playing", false)));
        i.putExtra("position", posD != null ? posD.longValue() : 0L);
        i.putExtra("duration", durD != null ? durD.longValue() : 0L);
        i.putExtra("speed",    spdD != null ? spdD.floatValue() : 1.0f);
        try {
            getContext().startService(i);
        } catch (Exception e) {
            Log.w(TAG, "position update: " + e.getMessage());
        }
        call.resolve();
    }

    @PermissionCallback
    private void notifPermissionCallback(PluginCall call) {
        // Proceed regardless — if denied, the service's startForeground() silently no-ops
        ensureReceiver();
        sendToService(call);
        call.resolve();
    }

    /** Packages the call params into an Intent and starts/updates MuzioPlaybackService. */
    private void sendToService(PluginCall call) {
        String  title   = nvl(call.getString("title",   ""));
        String  artist  = nvl(call.getString("artist",  ""));
        String  album   = nvl(call.getString("album",   ""));
        String  art     = nvl(call.getString("art",     ""));
        boolean playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        // JS sends position/duration as milliseconds (integer)
        Double posD = call.getDouble("position", 0.0);
        Double durD = call.getDouble("duration", 0.0);
        long position = posD != null ? posD.longValue() : 0L;
        long duration = durD != null ? durD.longValue() : 0L;

        Intent intent = new Intent(getContext(), MuzioPlaybackService.class);
        intent.setAction(MuzioPlaybackService.ACTION_UPDATE);
        intent.putExtra("title",    title);
        intent.putExtra("artist",   artist);
        intent.putExtra("album",    album);
        intent.putExtra("art",      art);
        intent.putExtra("playing",  playing);
        intent.putExtra("position", position);
        intent.putExtra("duration", duration);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                    && !MuzioPlaybackService.isRunning) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
        } catch (Exception e) {
            Log.e(TAG, "sendToService: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void hideMediaNotification(PluginCall call) {
        stopService();
        call.resolve();
    }

    /** Returns whether the app is already exempt from battery optimizations. */
    @PluginMethod
    public void isBatteryOptimizationExempt(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            ret.put("exempt", pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName()));
        } else {
            ret.put("exempt", true); // pre-M doesn't have Doze
        }
        call.resolve(ret);
    }

    /** Launches the system dialog asking the user to whitelist this app from battery optimization. */
    @PluginMethod
    public void requestBatteryOptimizationExemption(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
            getActivity().startActivity(intent);
        } catch (Exception e) {
            // Fallback: open the app's battery settings page
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + getContext().getPackageName()));
                getActivity().startActivity(fallback);
            } catch (Exception ignored) {}
        }
        call.resolve();
    }

    private void stopService() {
        try {
            Intent intent = new Intent(getContext(), MuzioPlaybackService.class);
            intent.setAction(MuzioPlaybackService.ACTION_HIDE);
            getContext().startService(intent);
        } catch (Exception ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        // Unregister the broadcast receiver when the plugin is torn down.
        // The service (if running) handles its own lifecycle independently.
        if (receiverRegistered && notifReceiver != null) {
            try {
                getContext().getApplicationContext().unregisterReceiver(notifReceiver);
            } catch (Exception ignored) {}
            notifReceiver = null;
            receiverRegistered = false;
        }
    }

    // ─── MediaStore query ─────────────────────────────────────────────────────

    private void doQuery(PluginCall call) {
        Context ctx = getContext();
        JSArray files = new JSArray();

        String[] projection = {
            MediaStore.Audio.Media._ID,
            MediaStore.Audio.Media.DISPLAY_NAME,
            MediaStore.Audio.Media.DATA,
            MediaStore.Audio.Media.DURATION,
            MediaStore.Audio.Media.TITLE,
            MediaStore.Audio.Media.ARTIST,
            MediaStore.Audio.Media.ALBUM,
            MediaStore.Audio.Media.ALBUM_ID,
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
            MediaStore.Audio.Media.DATE_ADDED,
            MediaStore.Audio.Media.SIZE,
            "album_artist",
            "genre",
        };

        // Include every audio file that isn't a system sound. IS_MUSIC misses downloaded
        // songs (YouTube, SoundCloud, etc.) that Android stores with IS_MUSIC=0, and a
        // DURATION filter would drop files MediaStore failed to probe (DURATION=0) —
        // exactly the ones we now recover with the native player.
        String selection = MediaStore.Audio.Media.MIME_TYPE + " LIKE 'audio/%'"
            + " AND " + MediaStore.Audio.Media.IS_RINGTONE     + " = 0"
            + " AND " + MediaStore.Audio.Media.IS_NOTIFICATION + " = 0"
            + " AND " + MediaStore.Audio.Media.IS_ALARM        + " = 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        try (Cursor cursor = ctx.getContentResolver().query(uri, projection, selection, null, sortOrder)) {
            if (cursor != null) {
                int idCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int pathCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int durCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int titleCol  = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int albIdCol  = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int trkCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
                int yrCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR);
                int albArtCol  = cursor.getColumnIndex("album_artist");
                int genreCol   = cursor.getColumnIndex("genre");
                int dateAddCol = cursor.getColumnIndex(MediaStore.Audio.Media.DATE_ADDED);
                int sizeCol    = cursor.getColumnIndex(MediaStore.Audio.Media.SIZE);

                while (cursor.moveToNext()) {
                    long   id      = cursor.getLong(idCol);
                    String name    = cursor.getString(nameCol);
                    String path    = cursor.getString(pathCol);
                    long   durMs   = cursor.getLong(durCol);
                    String title   = cursor.getString(titleCol);
                    String artist  = cursor.getString(artCol);
                    String album   = cursor.getString(albCol);
                    long   albumId = cursor.getLong(albIdCol);
                    int    trackRaw = cursor.getInt(trkCol);
                    int    year    = cursor.getInt(yrCol);
                    String albumArtist = (albArtCol  >= 0) ? cursor.getString(albArtCol)  : null;
                    String genre       = (genreCol   >= 0) ? cursor.getString(genreCol)   : null;
                    long   dateAdded   = (dateAddCol >= 0) ? cursor.getLong(dateAddCol)   : 0;
                    long   size        = (sizeCol    >= 0) ? cursor.getLong(sizeCol)      : -1;

                    // MediaStore encodes disc as disc*1000 + track
                    int discNum  = trackRaw > 999 ? trackRaw / 1000 : 1;
                    int trackNum = trackRaw > 999 ? trackRaw % 1000 : trackRaw;

                    Uri contentUri = Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));

                    if (name   == null) name   = "";
                    if (path   == null) path   = "";
                    if (title  == null || title.isEmpty())            title  = name.replaceAll("\\.[^.]+$", "");
                    if (artist == null || artist.equals("<unknown>")) artist = "Unknown Artist";
                    if (album  == null || album.isEmpty())            album  = "Unknown Album";
                    if (albumArtist == null || albumArtist.equals("<unknown>")) albumArtist = "";
                    if (genre  == null) genre  = "";

                    String albumArtUri = albumId > 0
                        ? "content://media/external/audio/albumart/" + albumId : "";

                    JSObject file = new JSObject();
                    file.put("id",          id);
                    file.put("name",        name);
                    file.put("path",        path);
                    file.put("contentUri",  contentUri.toString());
                    file.put("albumArtUri", albumArtUri);
                    file.put("albumArtist", albumArtist);
                    file.put("dur",         durMs / 1000.0);
                    file.put("title",       title);
                    file.put("artist",      artist);
                    file.put("album",       album);
                    file.put("disc",        discNum);
                    file.put("track",       trackNum);
                    file.put("year",        (year > 0 && year != 1970) ? String.valueOf(year) : "");
                    file.put("genre",       genre);
                    file.put("dateAdded",   dateAdded);
                    file.put("size",        size);
                    files.put(file);
                }
            }
        } catch (Exception e) {
            call.reject("MediaStore error: " + e.getMessage());
            return;
        }

        JSObject result = new JSObject();
        result.put("files", files);
        result.put("count", files.length());
        call.resolve(result);
    }
}
