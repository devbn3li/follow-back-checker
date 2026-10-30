package io.github.devbn3li.followcheck

import android.content.Context
import java.io.File

/**
 * The checker's own data, one JSON file per key under the app's private files. Only the app can read
 * them, and Android's auto backup carries them to a new phone along with the rest of the app's files.
 */
object DataStore {
    private const val DIR = "store"
    private const val MAX_CHARS = 50 * 1024 * 1024
    // The checker's keys: fbc, fbcDone, fbc.acct.<id>, fbc.counts... Nothing that can leave the folder.
    private val KEY = Regex("fbc[A-Za-z0-9._-]{0,80}")

    fun validKey(key: String): Boolean = KEY.matches(key) && !key.contains("..")

    fun get(ctx: Context, key: String): String {
        val f = file(ctx, key) ?: return ""
        return try { if (f.exists()) f.readText() else "" } catch (e: Exception) { "" }
    }

    fun set(ctx: Context, key: String, json: String): Boolean {
        if (json.length > MAX_CHARS) return false
        val f = file(ctx, key) ?: return false
        // Written beside the file and renamed over it, so a crash mid-write never leaves half a history.
        val tmp = File(f.parentFile, f.name + ".tmp")
        return try {
            tmp.writeText(json)
            tmp.renameTo(f)
        } catch (e: Exception) {
            tmp.delete()
            false
        }
    }

    fun remove(ctx: Context, key: String) {
        file(ctx, key)?.delete()
    }

    private fun file(ctx: Context, key: String): File? {
        if (!validKey(key)) return null
        val dir = File(ctx.filesDir, DIR)
        if (!dir.isDirectory && !dir.mkdirs()) return null
        return File(dir, "$key.json")
    }
}
