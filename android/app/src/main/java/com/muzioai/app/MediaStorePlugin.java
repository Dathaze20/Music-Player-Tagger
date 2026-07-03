package com.muzioai.app;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.MediaStore;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "MediaStore")
public class MediaStorePlugin extends Plugin {

    @PluginMethod
    public void getAllAudioFiles(PluginCall call) {
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
            MediaStore.Audio.Media.TRACK,
            MediaStore.Audio.Media.YEAR,
        };

        String selection = MediaStore.Audio.Media.IS_MUSIC + " != 0";
        String sortOrder = MediaStore.Audio.Media.TITLE + " COLLATE NOCASE ASC";
        Uri uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI;

        try (Cursor cursor = ctx.getContentResolver().query(uri, projection, selection, null, sortOrder)) {
            if (cursor != null) {
                int idCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media._ID);
                int nameCol  = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DISPLAY_NAME);
                int pathCol  = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DATA);
                int durCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.DURATION);
                int titleCol = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TITLE);
                int artCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ARTIST);
                int albCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.ALBUM);
                int trkCol   = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.TRACK);
                int yrCol    = cursor.getColumnIndexOrThrow(MediaStore.Audio.Media.YEAR);

                while (cursor.moveToNext()) {
                    long   id      = cursor.getLong(idCol);
                    String name    = cursor.getString(nameCol);
                    String path    = cursor.getString(pathCol);
                    long   durMs   = cursor.getLong(durCol);
                    String title   = cursor.getString(titleCol);
                    String artist  = cursor.getString(artCol);
                    String album   = cursor.getString(albCol);
                    int    track   = cursor.getInt(trkCol);
                    int    year    = cursor.getInt(yrCol);

                    // content:// URI — works on all Android versions, on internal + SD card
                    Uri contentUri = Uri.withAppendedPath(
                        MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, String.valueOf(id));

                    // Normalize unknown values Android puts in tags
                    if (name   == null) name   = "";
                    if (path   == null) path   = "";
                    if (title  == null || title.isEmpty())    title  = name.replaceAll("\\.[^.]+$", "");
                    if (artist == null || artist.equals("<unknown>")) artist = "Unknown Artist";
                    if (album  == null || album.isEmpty())    album  = "Unknown Album";

                    // Track number: MediaStore stores disc/track as 1001 (disc 1, track 1)
                    // Strip disc component if present
                    int trackNum = track > 1000 ? track % 1000 : track;

                    JSObject file = new JSObject();
                    file.put("id",         id);
                    file.put("name",       name);
                    file.put("path",       path);
                    file.put("contentUri", contentUri.toString());
                    file.put("dur",        durMs / 1000.0);
                    file.put("title",      title);
                    file.put("artist",     artist);
                    file.put("album",      album);
                    file.put("track",      trackNum);
                    file.put("year",       year > 0 ? String.valueOf(year) : "");
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
