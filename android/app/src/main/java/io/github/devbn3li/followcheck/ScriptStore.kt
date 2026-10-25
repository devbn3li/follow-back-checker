package io.github.devbn3li.followcheck

import android.content.Context
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * The checker script: the copy bundled in the APK, refreshed from the repository so fixes
 * reach phones without a reinstall. The refreshed copy is kept in the app's private files.
 */
object ScriptStore {
    private const val REMOTE = "https://raw.githubusercontent.com/devbn3li/follow-back-checker/main/dist/checker.js"
    private const val FILE = "checker.js"
    private const val MARKER = "Follow Back Checker"

    fun load(ctx: Context): String {
        val cached = File(ctx.filesDir, FILE)
        if (cached.exists() && cached.length() > 1000) {
            try { return cached.readText() } catch (e: Exception) { /* fall back to the bundled copy */ }
        }
        return try {
            ctx.assets.open("checker.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            ""
        }
    }

    fun refresh(ctx: Context): String? {
        return try {
            val conn = URL(REMOTE).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/javascript, text/plain, */*")
            if (conn.responseCode != 200) return null
            val text = conn.inputStream.bufferedReader().use { it.readText() }
            if (text.length < 1000 || !text.contains(MARKER)) return null
            File(ctx.filesDir, FILE).writeText(text)
            text
        } catch (e: Exception) {
            null
        }
    }
}
