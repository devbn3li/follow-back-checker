package io.github.devbn3li.followcheck

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.work.Worker
import androidx.work.WorkerParameters

/**
 * Runs about once a day. When a week has passed without a check (and no reminder went out in the
 * last week) it posts a notification; tapping it opens the app, which runs the check by itself.
 */
class ReminderWorker(context: Context, params: WorkerParameters) : Worker(context, params) {
    override fun doWork(): Result {
        val ctx = applicationContext
        val prefs = Prefs.of(ctx)
        val now = System.currentTimeMillis()
        val installedAt = prefs.getLong(Prefs.INSTALLED_AT, 0L)
        if (installedAt <= 0L) {
            // Unknown install time (an update from a version without it): the week counts from now.
            prefs.edit().putLong(Prefs.INSTALLED_AT, now).apply()
            return Result.success()
        }
        val due = ReminderPolicy.isDue(
            enabled = prefs.getBoolean(Prefs.REMINDER_ENABLED, true),
            lastCheckAt = prefs.getLong(Prefs.LAST_CHECK_AT, 0L),
            installedAt = installedAt,
            lastRemindedAt = prefs.getLong(Prefs.LAST_REMINDED_AT, 0L),
            now = now
        )
        if (due && canNotify(ctx)) {
            postNotification(ctx)
            prefs.edit().putLong(Prefs.LAST_REMINDED_AT, now).apply()
        }
        return Result.success()
    }

    /** Android 13+ shows notifications only once the user has allowed them; without that, stay quiet. */
    private fun canNotify(ctx: Context): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return true
        return ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    private fun postNotification(ctx: Context) {
        val manager = ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        // Creating a channel that already exists is a no-op, so this is safe before every post.
        val channel = NotificationChannel(CHANNEL_ID, ctx.getString(R.string.reminder_channel), NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)

        val open = Intent(ctx, MainActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        val tap = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        val body = ctx.getString(R.string.reminder_body)
        val notification = NotificationCompat.Builder(ctx, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notify)
            .setContentTitle(ctx.getString(R.string.reminder_title))
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .setContentIntent(tap)
            .setAutoCancel(true)
            .build()
        manager.notify(NOTIFICATION_ID, notification)
    }

    companion object {
        const val CHANNEL_ID = "reminders"
        const val NOTIFICATION_ID = 1
    }
}
