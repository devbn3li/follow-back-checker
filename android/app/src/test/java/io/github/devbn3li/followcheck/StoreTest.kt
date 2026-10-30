package io.github.devbn3li.followcheck

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class StoreTest {
    private fun bundle(v: String) = "/* Follow Back Checker $v. Built from extension/ by scripts/build.js; do not edit by hand. */\n" + "x".repeat(2000)

    @Test
    fun theNewerScriptWins() {
        assertEquals(bundle("1.11.2"), ScriptStore.pick(bundle("1.11.1"), bundle("1.11.2")))
        assertEquals(bundle("1.12.0"), ScriptStore.pick(bundle("1.12.0"), bundle("1.11.2")))
        assertEquals(bundle("1.11.2") + "fix", ScriptStore.pick(bundle("1.11.2") + "fix", bundle("1.11.2")))
    }

    @Test
    fun aMissingCopyFallsBackToTheOther() {
        assertEquals(bundle("1.0.0"), ScriptStore.pick("", bundle("1.0.0")))
        assertEquals(bundle("1.0.0"), ScriptStore.pick(bundle("1.0.0"), ""))
        assertEquals("1.11.2", ScriptStore.versionOf(bundle("1.11.2")))
        assertEquals("", ScriptStore.versionOf("no banner"))
        assertTrue(ScriptStore.compareVersions("1.10.0", "1.9.9") > 0)
    }

    @Test
    fun onlyTheCheckersKeysAreFiles() {
        assertTrue(DataStore.validKey("fbc"))
        assertTrue(DataStore.validKey("fbcDone"))
        assertTrue(DataStore.validKey("fbc.acct.1234567"))
        assertTrue(DataStore.validKey("fbc.counts"))
        assertFalse(DataStore.validKey("other"))
        assertFalse(DataStore.validKey("fbc/../../shared_prefs/x"))
        assertFalse(DataStore.validKey("fbc.."))
        assertFalse(DataStore.validKey("fbc" + "a".repeat(81)))
    }
}
