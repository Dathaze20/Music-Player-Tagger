package com.muzioai.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MediaStorePlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onBackPressed() {
        // Fire event to JS — the WebView handles navigation (close NowPlaying, drawer, etc.)
        // JS calls MediaStore.exitApp() when there's nothing left to dismiss
        getBridge().triggerJSEvent("capacitorBackButton", "document");
    }
}
