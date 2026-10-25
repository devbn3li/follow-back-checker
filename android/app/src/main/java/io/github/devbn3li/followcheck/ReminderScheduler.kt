package io.github.devbn3li.followcheck

import android.content.Context
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import java.util.concurrent.TimeUnit

/** The daily background job behind the weekly reminder: scheduled once, kept across launches. */
object ReminderScheduler {
    const val WORK_NAME = "reminder"

    /** Makes sure the daily job exists; a job that is already scheduled is left as it is. */
    fun ensure(ctx: Context) {
        val request = PeriodicWorkRequest.Builder(ReminderWorker::class.java, 24L, TimeUnit.HOURS).build()
        WorkManager.getInstance(ctx.applicationContext)
            .enqueueUniquePeriodicWork(WORK_NAME, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /** Stops the daily job (the user switched reminders off). */
    fun cancel(ctx: Context) {
        WorkManager.getInstance(ctx.applicationContext).cancelUniqueWork(WORK_NAME)
    }
}
