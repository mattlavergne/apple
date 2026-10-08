package com.mattlavergne.theapple;

import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        lockOrientation(getResources().getConfiguration());
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        lockOrientation(newConfig);
    }

    // Phones play in portrait, like the iPhone build. Tablets and unfolded
    // foldables turn freely (Android 16 ignores locks on large screens anyway).
    private void lockOrientation(Configuration config) {
        setRequestedOrientation(config.smallestScreenWidthDp < 600
            ? ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
            : ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
    }
}
