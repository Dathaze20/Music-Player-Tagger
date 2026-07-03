package com.muzioai.app;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaStorePlugin.class);
        super.onCreate(savedInstanceState);

        // onBackPressed() is deprecated on Android 13+ — use OnBackPressedDispatcher instead.
        // Fires a JS event so the WebView handles navigation (close overlay → exit app).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() != null && getBridge().getWebView() != null) {
                    getBridge().getWebView().evaluateJavascript(
                        "document.dispatchEvent(new Event('capacitorBackButton'));", null);
                }
            }
        });
    }
}
