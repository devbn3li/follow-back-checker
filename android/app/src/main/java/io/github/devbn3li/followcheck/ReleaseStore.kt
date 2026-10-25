package io.github.devbn3li.followcheck

import android.content.Context
import java.io.ByteArrayOutputStream
import java.io.InputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * The latest GitHub release of the app, fetched at most once every six hours and kept in the
 * preferences, so the page can tell the user that a newer version exists. While the repository
 * is private the API answers 404; then nothing is stored and the next try also waits six hours.
 */
object ReleaseStore {
    private const val LATEST = "https://api.github.com/repos/devbn3li/follow-back-checker/releases/latest"
    private const val INTERVAL_MS = 6L * 60 * 60 * 1000
    private const val MAX_BYTES = 64 * 1024

    /** Fetches the release JSON when the last attempt is older than six hours. Call off the UI thread. */
    fun refresh(ctx: Context) {
        val prefs = Prefs.of(ctx)
        val now = System.currentTimeMillis()
        val checkedAt = prefs.getLong(Prefs.RELEASE_CHECKED_AT, 0L)
        if (checkedAt in (now - INTERVAL_MS)..now) return
        val body = fetch()
        val editor = prefs.edit().putLong(Prefs.RELEASE_CHECKED_AT, now)
        if (body != null) editor.putString(Prefs.RELEASE_JSON, body)
        editor.apply()
    }

    /** The release JSON from the last successful fetch, or "" when there was none yet. */
    fun cached(ctx: Context): String = Prefs.of(ctx).getString(Prefs.RELEASE_JSON, null) ?: ""

    private fun fetch(): String? {
        return try {
            val conn = URL(LATEST).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000
            conn.readTimeout = 8000
            conn.setRequestProperty("Accept", "application/vnd.github+json")
            conn.setRequestProperty("User-Agent", "FollowCheck")
            try {
                if (conn.responseCode != 200 || conn.contentLength > MAX_BYTES) return null
                val bytes = readCapped(conn.inputStream, MAX_BYTES) ?: return null
                val text = String(bytes, Charsets.UTF_8)
                // Only a JSON object is worth keeping; a captive portal's HTML page is not.
                if (text.trimStart().startsWith("{")) text else null
            } finally {
                conn.disconnect()
            }
        } catch (e: Exception) {
            null
        }
    }

    /** Reads the whole stream, or gives up (null) as soon as it grows past [max] bytes. */
    private fun readCapped(stream: InputStream, max: Int): ByteArray? = stream.use { input ->
        val out = ByteArrayOutputStream()
        val buf = ByteArray(8192)
        var tooBig = false
        while (!tooBig) {
            val n = input.read(buf)
            if (n < 0) break
            out.write(buf, 0, n)
            tooBig = out.size() > max
        }
        if (tooBig) null else out.toByteArray()
    }
}
