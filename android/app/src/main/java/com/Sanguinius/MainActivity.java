package com.Sanguinius;

import android.os.Bundle;
import android.view.WindowManager;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // FLAG_SECURE hides the app contents from:
        //   * the system recents/overview thumbnail (financial dashboard
        //     should not sit visible on the multitasking screen)
        //   * screenshots and on-device screen recording
        //   * non-secure displays during casting / mirroring
        //
        // Must be set BEFORE super.onCreate(...) draws the first frame.
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        super.onCreate(savedInstanceState);
    }
}
