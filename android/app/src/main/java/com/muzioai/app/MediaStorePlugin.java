package com.muzioai.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.ByteBuffer;
import java.nio.channels.FileChannel;
import java.util.Collections;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        // Android 13+ (API 33): READ_MEDIA_AUDIO is the required permission
        @Permission(alias = "audioApi33", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        // Android 12 and below
        @Permission(alias = "audioLegacy", strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
        // Write for Android 9 and below (API 30+ uses MediaStore.createWriteRequest instead)
        @Permission(alias = "writeStorage", strings = { "android.permission.WRITE_EXTERNAL_STORAGE" })
    }
)
public class MediaStorePlugin extends Plugin {

    private static final int WRITE_REQUEST_CODE = 9001;

    // Saved state for the write-permission activity callback
    private PluginCall savedWriteCall;
    private Uri pendingWriteUri;

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
            call.reject("Permission denied — go to Settings → Apps → Muzio AI → Permissions → Files and media");
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

    @PluginMethod
    public void readAlbumArt(PluginCall call) {
        String uriStr = call.getString("uri", "");
        int reqSize = call.getInt("size", 192);
        if (reqSize < 48) reqSize = 48;
        if (reqSize > 1200) reqSize = 1200;
        if (uriStr == null || uriStr.isEmpty()) { call.reject("No uri"); return; }
        try {
            Uri artUri = Uri.parse(uriStr);
            InputStream is = getContext().getContentResolver().openInputStream(artUri);
            if (is == null) { call.reject("null stream"); return; }
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inSampleSize = reqSize <= 256 ? 2 : 1;
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(is, null, opts);
            is.close();
            if (bmp == null) { call.reject("decode failed"); return; }
            android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(bmp, reqSize, reqSize, true);
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

    // ─── Tag writing ──────────────────────────────────────────────────────────

    @PluginMethod
    public void writeFileTags(PluginCall call) {
        String uriStr = call.getString("contentUri", "");
        if (uriStr == null || uriStr.isEmpty()) {
            call.reject("No contentUri");
            return;
        }
        Uri uri = Uri.parse(uriStr);

        // API < 30: need WRITE_EXTERNAL_STORAGE
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
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

        // API 30+: try directly — if the OS hasn't granted write access yet, we'll
        // catch RecoverableSecurityException and launch the system permission dialog.
        call.setKeepAlive(true);
        try {
            doWriteFileTags(call, uri);
        } catch (android.app.RecoverableSecurityException rse) {
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

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);
        if (requestCode != WRITE_REQUEST_CODE) return;

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

    // ─── Core tag-write logic ─────────────────────────────────────────────────

    private void doWriteFileTags(PluginCall call, Uri uri) throws Exception {
        Context ctx = getContext();
        ContentResolver resolver = ctx.getContentResolver();

        String title       = nvl(call.getString("title", ""));
        String artist      = nvl(call.getString("artist", ""));
        String album       = nvl(call.getString("album", ""));
        String year        = nvl(call.getString("year", ""));
        String genre       = nvl(call.getString("genre", ""));
        String albumArtist = nvl(call.getString("albumArtist", ""));
        String lyrics      = nvl(call.getString("lyrics", ""));
        String artBase64   = nvl(call.getString("artBase64", ""));

        // Decode embedded art (optional)
        byte[] artBytes = null;
        if (!artBase64.isEmpty()) {
            int comma = artBase64.indexOf(',');
            String b64 = comma >= 0 ? artBase64.substring(comma + 1) : artBase64;
            try { artBytes = Base64.decode(b64, Base64.DEFAULT); } catch (Exception ignored) {}
        }

        // Determine MIME type — only write ID3v2 bytes to MP3 files
        String mimeType = resolver.getType(uri);
        boolean isMP3 = "audio/mpeg".equals(mimeType)
                     || "audio/x-mpeg".equals(mimeType)
                     || "audio/mp3".equals(mimeType);

        boolean fileWritten = false;
        if (isMP3) {
            // Open the file for read+write. On API 30+ this throws RecoverableSecurityException
            // if our app doesn't have write grant for this URI yet.
            ParcelFileDescriptor pfd = resolver.openFileDescriptor(uri, "rw");
            try {
                // Read all bytes
                FileInputStream fis = new FileInputStream(pfd.getFileDescriptor());
                byte[] fileBytes = readAll(fis);

                // Find where the actual audio data starts (skip any existing ID3v2 tag)
                int audioStart = findAudioDataStart(fileBytes);

                // Build the new ID3v2.3 tag
                byte[] id3Tag = buildId3v2Tag(title, artist, album, year, genre,
                                              albumArtist, lyrics, artBytes);

                // Overwrite the file: truncate to 0, write new tag + audio bytes
                FileOutputStream fos = new FileOutputStream(pfd.getFileDescriptor());
                FileChannel ch = fos.getChannel();
                ch.position(0);
                ch.truncate(0);
                ch.write(ByteBuffer.wrap(id3Tag));
                ch.write(ByteBuffer.wrap(fileBytes, audioStart, fileBytes.length - audioStart));
                ch.force(true);
            } finally {
                pfd.close();
            }
            fileWritten = true;
        }

        // Always update the MediaStore index so the library stays consistent
        ContentValues cv = new ContentValues();
        if (!title.isEmpty())       cv.put(MediaStore.Audio.Media.TITLE, title);
        if (!artist.isEmpty())      cv.put(MediaStore.Audio.Media.ARTIST, artist);
        if (!album.isEmpty())       cv.put(MediaStore.Audio.Media.ALBUM, album);
        if (!year.isEmpty()) {
            try { cv.put(MediaStore.Audio.Media.YEAR, Integer.parseInt(year)); }
            catch (NumberFormatException ignored) {}
        }
        if (Build.VERSION.SDK_INT >= 30) {
            if (!genre.isEmpty())       cv.put("genre",        genre);
            if (!albumArtist.isEmpty()) cv.put("album_artist", albumArtist);
        }
        if (cv.size() > 0) {
            resolver.update(uri, cv, null, null);
        }

        JSObject result = new JSObject();
        result.put("success", true);
        result.put("fileWritten", fileWritten);
        if (!isMP3) {
            result.put("note", "MediaStore metadata updated. ID3v2 embedding is only supported for MP3 files.");
        }
        call.resolve(result);
    }

    // ─── ID3v2.3 builder ──────────────────────────────────────────────────────

    private byte[] buildId3v2Tag(String title, String artist, String album, String year,
            String genre, String albumArtist, String lyrics, byte[] artBytes) throws Exception {

        ByteArrayOutputStream frames = new ByteArrayOutputStream();

        if (!title.isEmpty())       writeTextFrame(frames, "TIT2", title);
        if (!artist.isEmpty())      writeTextFrame(frames, "TPE1", artist);
        if (!album.isEmpty())       writeTextFrame(frames, "TALB", album);
        if (!year.isEmpty())        writeTextFrame(frames, "TYER", year);
        if (!genre.isEmpty())       writeTextFrame(frames, "TCON", genre);
        if (!albumArtist.isEmpty()) writeTextFrame(frames, "TPE2", albumArtist);
        if (!lyrics.isEmpty())      writeUsltFrame(frames, lyrics);
        if (artBytes != null && artBytes.length > 0) writeApicFrame(frames, artBytes);

        byte[] framesData = frames.toByteArray();

        // ID3v2.3 header (10 bytes)
        byte[] header = new byte[10];
        header[0] = 'I'; header[1] = 'D'; header[2] = '3';
        header[3] = 3; header[4] = 0;  // version 2.3.0
        header[5] = 0;                  // no flags

        // Tag size as sync-safe integer (7 bits per byte)
        int size = framesData.length;
        header[6] = (byte) ((size >> 21) & 0x7F);
        header[7] = (byte) ((size >> 14) & 0x7F);
        header[8] = (byte) ((size >> 7)  & 0x7F);
        header[9] = (byte) (size & 0x7F);

        ByteArrayOutputStream tag = new ByteArrayOutputStream(10 + framesData.length);
        tag.write(header);
        tag.write(framesData);
        return tag.toByteArray();
    }

    private void writeTextFrame(ByteArrayOutputStream out, String id, String text) throws Exception {
        byte[] textBytes = text.getBytes("UTF-8");
        byte[] frameData = new byte[1 + textBytes.length];
        frameData[0] = 3; // UTF-8 encoding
        System.arraycopy(textBytes, 0, frameData, 1, textBytes.length);
        writeFrame(out, id, frameData);
    }

    private void writeUsltFrame(ByteArrayOutputStream out, String lyrics) throws Exception {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        data.write(3);                              // UTF-8 encoding
        data.write("eng".getBytes("ISO-8859-1"));  // language
        data.write(0);                              // empty description
        data.write(lyrics.getBytes("UTF-8"));
        writeFrame(out, "USLT", data.toByteArray());
    }

    private void writeApicFrame(ByteArrayOutputStream out, byte[] jpegBytes) throws Exception {
        ByteArrayOutputStream data = new ByteArrayOutputStream();
        data.write(0);                                          // Latin-1 encoding (for MIME+desc)
        data.write("image/jpeg".getBytes("ISO-8859-1"));       // MIME type
        data.write(0);                                          // MIME null terminator
        data.write(3);                                          // picture type: Cover art (front)
        data.write(0);                                          // empty description
        data.write(jpegBytes);
        writeFrame(out, "APIC", data.toByteArray());
    }

    private void writeFrame(ByteArrayOutputStream out, String id, byte[] data) throws Exception {
        out.write(id.getBytes("ISO-8859-1")); // 4-byte frame ID
        // ID3v2.3 frame size: 32-bit big-endian (NOT sync-safe)
        int size = data.length;
        out.write((size >> 24) & 0xFF);
        out.write((size >> 16) & 0xFF);
        out.write((size >> 8) & 0xFF);
        out.write(size & 0xFF);
        out.write(0); out.write(0); // frame flags
        out.write(data);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** Returns the byte offset where audio data begins, skipping any ID3v2 header. */
    private int findAudioDataStart(byte[] data) {
        if (data.length < 10) return 0;
        if (data[0] == 'I' && data[1] == 'D' && data[2] == '3') {
            // Parse sync-safe tag size (bytes 6-9, 7 bits each)
            int size = ((data[6] & 0x7F) << 21)
                     | ((data[7] & 0x7F) << 14)
                     | ((data[8] & 0x7F) << 7)
                     | (data[9] & 0x7F);
            boolean hasFooter = (data[5] & 0x10) != 0;
            int tagEnd = 10 + size + (hasFooter ? 10 : 0);
            return Math.min(tagEnd, data.length);
        }
        return 0;
    }

    private byte[] readAll(InputStream in) throws Exception {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] tmp = new byte[65536];
        int n;
        while ((n = in.read(tmp)) != -1) buf.write(tmp, 0, n);
        return buf.toByteArray();
    }

    private String nvl(String s) { return s == null ? "" : s; }

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
            "album_artist",
            "genre",
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        try (Cursor cursor = ctx.getContentResolver().query(uri, projection, selection, null, sortOrder)) {

            if (cursor != null) {
                int idCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int pathCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int durCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int titleCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int albIdCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int trkCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
                int yrCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR);
                int albArtCol  = cursor.getColumnIndex("album_artist");
                int genreCol   = cursor.getColumnIndex("genre");

                while (cursor.moveToNext()) {
                    long   id      = cursor.getLong(idCol);
                    String name    = cursor.getString(nameCol);
                    String path    = cursor.getString(pathCol);
                    long   durMs   = cursor.getLong(durCol);
                    String title   = cursor.getString(titleCol);
                    String artist  = cursor.getString(artCol);
                    String album   = cursor.getString(albCol);
                    long   albumId = cursor.getLong(albIdCol);
                    int    track   = cursor.getInt(trkCol);
                    int    year    = cursor.getInt(yrCol);
                    String albumArtist = (albArtCol >= 0) ? cursor.getString(albArtCol) : null;
                    String genre       = (genreCol  >= 0) ? cursor.getString(genreCol)  : null;

                    Uri contentUri = Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));

                    if (name        == null) name        = "";
                    if (path        == null) path        = "";
                    if (title       == null || title.isEmpty())           title       = name.replaceAll("\\.[^.]+$", "");
                    if (artist      == null || artist.equals("<unknown>")) artist      = "Unknown Artist";
                    if (album       == null || album.isEmpty())           album       = "Unknown Album";
                    if (albumArtist == null || albumArtist.equals("<unknown>")) albumArtist = "";
                    if (genre       == null) genre = "";

                    String albumArtUri = albumId > 0
                        ? "content://media/external/audio/albumart/" + albumId : "";

                    int trackNum = track > 1000 ? track % 1000 : track;

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
                    file.put("track",       trackNum);
                    file.put("year",        year > 0 ? String.valueOf(year) : "");
                    file.put("genre",       genre);
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
