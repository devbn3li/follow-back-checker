package io.github.devbn3li.followcheck

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.view.View
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat

/**
 * One screen: Instagram's website in a WebView, with the Follow Back Checker script injected into
 * every page. The user logs in on Instagram's own page; the app never sees or asks for a password.
 */
class MainActivity : AppCompatActivity() {
    private lateinit var web: WebView
    @Volatile private var script: String = ""

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
        val root = findViewById<View>(R.id.root)
        web = findViewById(R.id.web)

        // Android 15 draws the app behind the system bars. Keep the page (and the panel's header)
        // clear of the status bar, the navigation bar and the keyboard.
        ViewCompat.setOnApplyWindowInsetsListener(root) { v, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsetsCompat.CONSUMED
        }
        WindowCompat.getInsetsController(window, root).isAppearanceLightStatusBars = false

        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            useWideViewPort = true
            loadWithOverviewMode = true
            mediaPlaybackRequiresUserGesture = true
        }
        val cookies = CookieManager.getInstance()
        cookies.setAcceptCookie(true)
        cookies.setAcceptThirdPartyCookies(web, false)
        web.webChromeClient = WebChromeClient()
        web.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val url = request.url
                val scheme = url.scheme ?: return false
                // "Open Instagram" and "Use the app" are intent:// links to the official app. Stay here.
                if (scheme != "http" && scheme != "https") return true
                val host = url.host ?: return false
                if (isInstagram(host)) return false
                // Anything else (help pages, external links) opens in the phone's browser.
                try { startActivity(Intent(Intent.ACTION_VIEW, url)) } catch (e: Exception) { /* no browser available */ }
                return true
            }

            override fun onPageFinished(view: WebView, url: String?) { inject(view) }

            // Instagram navigates without reloading, so make sure the checker is present after that too.
            override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) { inject(view) }
        }

        // window.FollowCheckHost: saves the checker's exports into Downloads (saveText, saveBase64, saveUrl),
        // records checks and the reminder setting for the weekly reminder (noteCheck, setReminder,
        // reminderEnabled), reports the installed version and the latest GitHub release (appVersion,
        // latestRelease), opens links in the phone's browser (openExternal) and keeps the checker's data
        // in the app's own files (storeGet, storeSet, storeRemove).
        web.addJavascriptInterface(HostBridge(this), "FollowCheckHost")

        script = ScriptStore.load(this)
        if (savedInstanceState != null) web.restoreState(savedInstanceState) else web.loadUrl(HOME)

        Thread {
            val fresh = ScriptStore.refresh(this)
            if (fresh != null) script = fresh
            ReleaseStore.refresh(this)
        }.start()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (web.canGoBack()) web.goBack() else finish()
            }
        })

        // The weekly reminder: remember the first launch (its week counts from here until the first
        // check) and keep the daily job scheduled while reminders are on.
        val prefs = Prefs.of(this)
        if (prefs.getLong(Prefs.INSTALLED_AT, 0L) <= 0L) {
            prefs.edit().putLong(Prefs.INSTALLED_AT, System.currentTimeMillis()).apply()
        }
        if (prefs.getBoolean(Prefs.REMINDER_ENABLED, true)) ReminderScheduler.ensure(this)

        showIntroOnce()
    }

    private fun isInstagram(host: String): Boolean =
        host == "instagram.com" || host.endsWith(".instagram.com") ||
            host.endsWith(".facebook.com") || host.endsWith(".cdninstagram.com") || host.endsWith(".fbcdn.net")

    private fun inject(view: WebView) {
        val src = script
        if (src.isEmpty()) return
        view.evaluateJavascript("!!window.__fbcLoaded") { loaded ->
            if (loaded != "true") {
                view.evaluateJavascript("window.FBC_HOST='android';", null)
                view.evaluateJavascript(src, null)
            }
        }
    }

    private fun showIntroOnce() {
        val prefs = getSharedPreferences("followcheck", MODE_PRIVATE)
        if (prefs.getBoolean("intro_shown", false)) {
            askNotificationsOnce()
            return
        }
        AlertDialog.Builder(this)
            .setTitle(R.string.intro_title)
            .setMessage(R.string.intro_body)
            .setPositiveButton(R.string.intro_ok) { dialog, _ -> dialog.dismiss() }
            .setOnDismissListener {
                prefs.edit().putBoolean("intro_shown", true).apply()
                // The permission prompt comes after the intro, so the two dialogs never overlap.
                askNotificationsOnce()
            }
            .show()
    }

    /** Android 13+ needs the user's permission before the weekly reminder can show; ask one time only. */
    private fun askNotificationsOnce() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || isFinishing) return
        val prefs = Prefs.of(this)
        if (prefs.getBoolean(Prefs.NOTIF_ASKED, false)) return
        prefs.edit().putBoolean(Prefs.NOTIF_ASKED, true).apply()
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(this, arrayOf(Manifest.permission.POST_NOTIFICATIONS), REQUEST_NOTIFICATIONS)
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        web.saveState(outState)
    }

    override fun onDestroy() {
        web.destroy()
        super.onDestroy()
    }

    companion object {
        // The login page, not the landing page that pushes the official app. Logged-in users are sent on to the feed.
        const val HOME = "https://www.instagram.com/accounts/login/"
        private const val REQUEST_NOTIFICATIONS = 1
    }
}
