package com.muzioai.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(
    name = "MediaStore",
    permissions = {
        // Android 13+ (API 33): READ_MEDIA_AUDIO is the required permission
        @Permission(alias = "audioApi33", strings = { "android.permission.READ_MEDIA_AUDIO" }),
        // Android 12 and below
        @Permission(alias = "audioLegacy", strings = { "android.permission.READ_EXTERNAL_STORAGE" })
    }
)
public class MediaStorePlugin extends Plugin {

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
        if (uriStr == null || uriStr.isEmpty()) { call.reject("No uri"); return; }
        try {
            Uri artUri = Uri.parse(uriStr);
            java.io.InputStream is = getContext().getContentResolver().openInputStream(artUri);
            if (is == null) { call.reject("null stream"); return; }
            android.graphics.BitmapFactory.Options opts = new android.graphics.BitmapFactory.Options();
            opts.inSampleSize = 2;
            android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(is, null, opts);
            is.close();
            if (bmp == null) { call.reject("decode failed"); return; }
            android.graphics.Bitmap scaled = android.graphics.Bitmap.createScaledBitmap(bmp, 192, 192, true);
            if (scaled != bmp) bmp.recycle();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            scaled.compress(android.graphics.Bitmap.CompressFormat.JPEG, 75, baos);
            scaled.recycle();
            String b64 = android.util.Base64.encodeToString(baos.toByteArray(), android.util.Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("data", "data:image/jpeg;base64," + b64);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("readAlbumArt: " + e.getMessage());
        }
    }

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
            "album_artist", // MediaStore.Audio.Media.ALBUM_ARTIST (API 30+)
            "genre",        // MediaStore.Audio.Media.GENRE (API 30+)
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        try (Cursor cursor = ctx.getContentResolver().query(uri, projection, selection, null, sortOrder)) {

            if (cursor != null) {
                int idCol       = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int pathCol     = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int durCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int titleCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int albIdCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM_ID);
                int trkCol      = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
                int yrCol       = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR);
                int albArtCol   = cursor.getColumnIndex("album_artist");
                int genreCol    = cursor.getColumnIndex("genre");

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

                    // content:// URI — works on all Android versions, on internal + SD card
                    Uri contentUri = Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));

                    if (name        == null) name        = "";
                    if (path        == null) path        = "";
                    if (title       == null || title.isEmpty())       title       = name.replaceAll("\\.[^.]+$", "");
                    if (artist      == null || artist.equals("<unknown>")) artist  = "Unknown Artist";
                    if (album       == null || album.isEmpty())       album       = "Unknown Album";
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
