package io.github.devbn3li.followcheck

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReminderPolicyTest {
    private val day = 24L * 60 * 60 * 1000
    private val installedAt = 1_700_000_000_000L
    private val week = ReminderPolicy.WEEK_MS

    @Test
    fun dueAfterSevenDaysWithoutACheck() {
        val lastCheck = installedAt + day
        assertTrue(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = 0L, now = lastCheck + week))
        assertTrue(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = 0L, now = lastCheck + 10 * day))
    }

    @Test
    fun notDueBeforeSevenDaysHavePassed() {
        val lastCheck = installedAt + day
        assertFalse(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = 0L, now = lastCheck + week - 1))
        assertFalse(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = 0L, now = lastCheck + 3 * day))
    }

    @Test
    fun notDueWhenDisabled() {
        val lastCheck = installedAt + day
        assertFalse(ReminderPolicy.isDue(enabled = false, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = 0L, now = lastCheck + 30 * day))
    }

    @Test
    fun notDueWhenRemindedLessThanAWeekAgo() {
        val lastCheck = installedAt + day
        val reminded = lastCheck + week
        assertFalse(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = reminded, now = reminded + 3 * day))
        // A week after that reminder it is due again.
        assertTrue(ReminderPolicy.isDue(enabled = true, lastCheckAt = lastCheck, installedAt = installedAt, lastRemindedAt = reminded, now = reminded + week))
    }

    @Test
    fun usesInstallTimeWhenThereWasNeverACheck() {
        assertFalse(ReminderPolicy.isDue(enabled = true, lastCheckAt = 0L, installedAt = installedAt, lastRemindedAt = 0L, now = installedAt + 6 * day))
        assertTrue(ReminderPolicy.isDue(enabled = true, lastCheckAt = 0L, installedAt = installedAt, lastRemindedAt = 0L, now = installedAt + 7 * day))
    }

    @Test
    fun notDueWhenInstallTimeIsUnknown() {
        assertFalse(ReminderPolicy.isDue(enabled = true, lastCheckAt = 0L, installedAt = 0L, lastRemindedAt = 0L, now = installedAt + 30 * day))
    }
}
