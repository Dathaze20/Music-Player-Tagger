# Keep Capacitor bridge and all plugin classes intact
-keep class com.getcapacitor.** { *; }
-keep class com.muzioai.app.** { *; }
-keepclassmembers class * {
    @com.getcapacitor.annotation.CapacitorPlugin *;
    @com.getcapacitor.PluginMethod *;
}

# Keep WebView JavaScript interface
-keepclassmembers class * extends android.webkit.WebViewClient {
    public *;
}

# Keep stack traces readable
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile
