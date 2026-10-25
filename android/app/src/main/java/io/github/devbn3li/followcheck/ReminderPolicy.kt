package io.github.devbn3li.followcheck

/**
 * When the weekly reminder is due. Plain arithmetic with no Android dependencies so it can be
 * unit-tested on the JVM; the worker feeds it the stored timestamps.
 */
object ReminderPolicy {
    const val WEEK_MS = 7L * 24 * 60 * 60 * 1000

    /**
     * True when reminders are on, a week has passed since the later of the last check and the
     * install, and no reminder went out during the last week. An unknown install time
     * ([installedAt] <= 0) is never due; the worker records it first.
     */
    fun isDue(enabled: Boolean, lastCheckAt: Long, installedAt: Long, lastRemindedAt: Long, now: Long): Boolean {
        if (!enabled || installedAt <= 0L) return false
        val sinceActivity = now - maxOf(lastCheckAt, installedAt)
        val sinceReminder = now - lastRemindedAt
        return sinceActivity >= WEEK_MS && sinceReminder >= WEEK_MS
    }
}
