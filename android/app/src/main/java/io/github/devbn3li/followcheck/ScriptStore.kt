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
        val bundled = try {
            ctx.assets.open("checker.js").bufferedReader().use { it.readText() }
        } catch (e: Exception) {
            ""
        }
        val file = File(ctx.filesDir, FILE)
        val cached = try { if (file.exists() && file.length() > 1000) file.readText() else "" } catch (e: Exception) { "" }
        return pick(cached, bundled)
    }

    /**
     * The refreshed copy unless the APK carries a newer one: after an app update without a network,
     * the copy refreshed before the update is older than the one in the new APK.
     */
    fun pick(cached: String, bundled: String): String {
        if (cached.isEmpty()) return bundled
        if (bundled.isEmpty()) return cached
        return if (compareVersions(versionOf(bundled), versionOf(cached)) > 0) bundled else cached
    }

    /** The version in the bundle's first line, "Follow Back Checker 1.11.2.", or "". */
    fun versionOf(text: String): String =
        Regex("""$MARKER (\d+\.\d+\.\d+)""").find(text.take(300))?.groupValues?.get(1) ?: ""

    fun compareVersions(a: String, b: String): Int {
        val x = a.split('.').map { it.toIntOrNull() ?: 0 }
        val y = b.split('.').map { it.toIntOrNull() ?: 0 }
        for (i in 0 until maxOf(x.size, y.size)) {
            val d = x.getOrElse(i) { 0 }.compareTo(y.getOrElse(i) { 0 })
            if (d != 0) return d
        }
        return 0
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
