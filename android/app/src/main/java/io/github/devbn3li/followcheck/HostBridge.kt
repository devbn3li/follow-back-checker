package io.github.devbn3li.followcheck

import android.app.Activity
import android.content.ContentValues
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import android.webkit.JavascriptInterface
import android.widget.Toast
import java.io.File

/**
 * What the page may ask the app for: saving a text file (the CSV and JSON exports) into the
 * phone's Downloads folder, since a WebView cannot download a file the page builds itself.
 */
class HostBridge(private val activity: Activity) {
    @JavascriptInterface
    fun saveText(name: String, mime: String, text: String): Boolean {
        val safe = name.replace(Regex("[^A-Za-z0-9._-]"), "_").take(80).ifEmpty { "follow-check.txt" }
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
                stream.use { it.write(text.toByteArray(Charsets.UTF_8)) }
            } else {
                val dir = activity.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS) ?: return false
                File(dir, safe).writeText(text)
            }
            activity.runOnUiThread {
                Toast.makeText(activity, activity.getString(R.string.saved_to_downloads, safe), Toast.LENGTH_SHORT).show()
            }
            true
        } catch (e: Exception) {
            false
        }
    }
}
