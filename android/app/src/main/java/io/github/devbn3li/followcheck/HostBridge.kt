package io.github.devbn3li.followcheck

import android.app.Activity
import android.app.DownloadManager
import android.content.ContentValues
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.util.Base64
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File

/**
 * What the page may ask the app for: saving a text file (the CSV and JSON exports) into the
 * phone's Downloads folder, since a WebView cannot download a file the page builds itself.
 */
class HostBridge(private val activity: Activity) {
    @JavascriptInterface
    fun saveText(name: String, mime: String, text: String): Boolean =
        saveBytes(name, mime, text.toByteArray(Charsets.UTF_8))

    /** Saves a drawn image the page hands over as base64 (the share card). */
    @JavascriptInterface
    fun saveBase64(name: String, mime: String, base64: String): Boolean {
        val bytes = try { Base64.decode(base64, Base64.DEFAULT) } catch (e: Exception) { return false }
        return saveBytes(name, mime, bytes)
    }

    private fun saveBytes(name: String, mime: String, bytes: ByteArray): Boolean {
        // Only the kinds of files the checker produces; the page must not be able to drop anything else.
        if (mime !in ALLOWED_MIME || bytes.size > MAX_BYTES) return false
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifEmpty { "follow-check.bin" }
        if (safe.endsWith(".apk", ignoreCase = true) || safe.endsWith(".html", ignoreCase = true)) return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val values = ContentValues().apply {
                    put(MediaStore.MediaColumns.DISPLAY_NAME, safe)
                    put(MediaStore.MediaColumns.MIME_TYPE, mime)
                    put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS)
                }
                val resolver = activity.contentResolver
                val uri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values) ?: return false
                val stream = resolver.openOutputStream(uri) ?: return false
                stream.use { it.write(bytes) }
            } else {
                val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
                File(dir, safe).writeBytes(bytes)
            }
            val message = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) R.string.saved_to_downloads else R.string.saved_to_app_folder
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(message, safe), Toast.LENGTH_SHORT).show()
            }
            true
        } catch (e: Exception) {
            false
        }
    }

    companion object {
        private val ALLOWED_MIME = setOf("text/csv", "application/json", "text/plain", "image/png", "image/jpeg")
        private const val MAX_BYTES = 25 * 1024 * 1024
    }

    /** Downloads a picture (an https link) into Downloads through the system download manager. */
    @JavascriptInterface
    fun saveUrl(url: String, name: String): Boolean {
        return try {
            val uri = Uri.parse(url)
            if (uri.scheme != "https") return false
            val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifEmpty { "image.jpg" }
            val request = DownloadManager.Request(uri)
                .setTitle(safe)
                .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                .setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, safe)
            val manager = activity.getSystemService(Context.DOWNLOAD_SERVICE) as DownloadManager
            manager.enqueue(request)
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.saved_to_downloads, safe), Toast.LENGTH_SHORT).show()
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
