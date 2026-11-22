package com.example.tourease;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.activity.OnBackPressedCallback;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private long backPressedTime = 0;
    private Toast exitToast;

    private void hideSystemStatusBar() {
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (controller != null) {
            controller.setAppearanceLightStatusBars(true);
            controller.setAppearanceLightNavigationBars(true);
            controller.setSystemBarsBehavior(WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            controller.hide(WindowInsetsCompat.Type.statusBars());
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Configure auto-hiding status bar with swipe-to-show transient behavior
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        hideSystemStatusBar();

        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webView);
        if (webView == null) {
            webView = new WebView(this);
            setContentView(webView);
        }
        webView.clearCache(true);
        WebSettings webSettings = webView.getSettings();

        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);
        webSettings.setDatabaseEnabled(true);
        webSettings.setAllowFileAccess(true);
        webSettings.setAllowContentAccess(true);
        webSettings.setGeolocationEnabled(true);
        webSettings.setJavaScriptCanOpenWindowsAutomatically(true);
        webSettings.setSupportMultipleWindows(false);

        // Customize User-Agent so Google OAuth doesn't trigger disallowed_useragent
        String defaultUa = webSettings.getUserAgentString();
        String cleanUa = defaultUa.replace("; wv", "").replace("Version/4.0 ", "");
        webSettings.setUserAgentString(cleanUa);

        webView.setWebChromeClient(new android.webkit.WebChromeClient() {
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, android.webkit.GeolocationPermissions.Callback callback) {
                callback.invoke(origin, true, false);
            }
        });

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
            if (checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION) != android.content.pm.PackageManager.PERMISSION_GRANTED) {
                requestPermissions(new String[]{
                    android.Manifest.permission.ACCESS_FINE_LOCATION,
                    android.Manifest.permission.ACCESS_COARSE_LOCATION
                }, 101);
            }
        }

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String url = uri != null ? uri.toString() : "";

                // Open telephone, mailto, and external intent links in system apps
                if (url.startsWith("tel:") ||
                    url.startsWith("mailto:") ||
                    url.startsWith("intent:")) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {
                        return false;
                    }
                }
                return false;
            }

            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                // If remote cloud instance is spinning up or offline, fallback to bundled offline asset
                if (failingUrl != null && failingUrl.startsWith("https://tourease-zocf.onrender.com")) {
                    view.loadUrl("file:///android_asset/index1.html");
                }
            }
        });

        // Register modern OnBackPressedCallback for webView history and double-back guard
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    if (backPressedTime + 2000 > System.currentTimeMillis()) {
                        if (exitToast != null) {
                            exitToast.cancel();
                        }
                        setEnabled(false);
                        getOnBackPressedDispatcher().onBackPressed();
                    } else {
                        exitToast = Toast.makeText(MainActivity.this, "Press back again to exit", Toast.LENGTH_SHORT);
                        exitToast.show();
                        backPressedTime = System.currentTimeMillis();
                    }
                }
            }
        });

        // Load bundled offline-first asset (connected to live Render backend for APIs)
        webView.loadUrl("file:///android_asset/index1.html");
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            hideSystemStatusBar();
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            if (backPressedTime + 2000 > System.currentTimeMillis()) {
                if (exitToast != null) {
                    exitToast.cancel();
                }
                super.onBackPressed();
            } else {
                exitToast = Toast.makeText(this, "Press back again to exit", Toast.LENGTH_SHORT);
                exitToast.show();
                backPressedTime = System.currentTimeMillis();
            }
        }
    }
}
