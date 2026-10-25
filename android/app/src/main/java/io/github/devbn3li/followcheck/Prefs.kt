package io.github.devbn3li.followcheck

import android.content.Context
import android.content.SharedPreferences

/** The app's one preferences file ("followcheck") and the keys the reminder and release checks share. */
object Prefs {
    const val FILE = "followcheck"

    /** First launch of the app, in millis; the reminder's week counts from here until the first check. */
    const val INSTALLED_AT = "installed_at"
    /** When the page last finished a check (reported through FollowCheckHost.noteCheck). */
    const val LAST_CHECK_AT = "last_check_at"
    /** When the last reminder notification was posted. */
    const val LAST_REMINDED_AT = "last_reminded_at"
    /** Whether the user wants the weekly reminder (on by default). */
    const val REMINDER_ENABLED = "reminder_enabled"
    /** Whether the notification permission was requested once already (Android 13+). */
    const val NOTIF_ASKED = "notif_asked"
    /** The latest GitHub release as JSON, and when it was last fetched (or attempted). */
    const val RELEASE_JSON = "release_json"
    const val RELEASE_CHECKED_AT = "release_checked_at"

    fun of(ctx: Context): SharedPreferences = ctx.getSharedPreferences(FILE, Context.MODE_PRIVATE)
}
