package com.muzioai.app;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.ParcelFileDescriptor;
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

import org.jaudiotagger.audio.AudioFile;
import org.jaudiotagger.audio.AudioFileIO;
import org.jaudiotagger.tag.FieldKey;
import org.jaudiotagger.tag.Tag;
import org.jaudiotagger.tag.images.Artwork;
import org.jaudiotagger.tag.images.ArtworkFactory;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.logging.Level;
import java.util.logging.Logger;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        @Permission(alias = "audioApi33", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        @Permission(alias = "audioLegacy", strings = { "android.permission.READ_EXTERNAL_STORAGE" }),
        @Permission(alias = "writeStorage", strings = { "android.permission.WRITE_EXTERNAL_STORAGE" })
    }
)
public class MediaStorePlugin extends Plugin {

    private static final String TAG           = "MediaStorePlugin";
    private static final int    WRITE_REQUEST_CODE = 9001;
    private static final int    SAF_REQUEST_CODE   = 9002;
    private static final String PREFS_NAME    = "muzio_prefs";
    private static final String PREF_SAF_URI  = "saf_tree_uri";

    // Saved state for async activity callbacks
    private PluginCall savedWriteCall;
    private Uri        pendingWriteUri;
    private PluginCall savedSafCall;

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
            opts.inSampleSize = reqSize <= 256 ? 2 : 1;
            android.graphics.Bitmap bmp;
            try {
                bmp = android.graphics.BitmapFactory.decodeStream(is, null, opts);
            } finally {
                try { is.close(); } catch (Exception ignored) {}
            }
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

    @Override
    protected void handleOnActivityResult(int requestCode, int resultCode, Intent data) {
        super.handleOnActivityResult(requestCode, resultCode, data);

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
        String lyrics      = nvl(call.getString("lyrics",      ""));
        String artBase64   = nvl(call.getString("artBase64",   ""));

        byte[] artBytes = null;
        if (!artBase64.isEmpty()) {
            int comma = artBase64.indexOf(',');
            String b64 = comma >= 0 ? artBase64.substring(comma + 1) : artBase64;
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

        // Copy the source file to a temp file so jaudiotagger has a real File to work with
        File tempFile = new File(ctx.getCacheDir(), "muzio_tag_edit." + ext);
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
            if (!lyrics.isEmpty())      tag.setField(FieldKey.LYRICS,       lyrics);

            if (artBytes != null && artBytes.length > 0) {
                Artwork artwork = ArtworkFactory.getNew();
                artwork.setBinaryData(artBytes);
                artwork.setMimeType("image/jpeg");
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
            updateMediaStore(resolver, mediaUri, title, artist, album, year, genre, albumArtist);

            // --- Phase 5: Trigger media scanner so Muzio and other apps see changes ---
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
            String genre, String albumArtist) {
        ContentValues cv = new ContentValues();
        if (!title.isEmpty())  cv.put(MediaStore.Audio.Media.TITLE,  title);
        if (!artist.isEmpty()) cv.put(MediaStore.Audio.Media.ARTIST, artist);
        if (!album.isEmpty())  cv.put(MediaStore.Audio.Media.ALBUM,  album);
        if (!year.isEmpty()) {
            try { cv.put(MediaStore.Audio.Media.YEAR, Integer.parseInt(year)); }
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
                int albArtCol = cursor.getColumnIndex("album_artist");
                int genreCol  = cursor.getColumnIndex("genre");

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
                    String albumArtist = (albArtCol >= 0) ? cursor.getString(albArtCol) : null;
                    String genre       = (genreCol  >= 0) ? cursor.getString(genreCol)  : null;

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
