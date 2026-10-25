# Follow Back Checker

Who you follow on Instagram that doesn't follow you back, who follows you without a follow back, your mutuals, and what changed over time. It works from your own logged-in session, asks Instagram only what the website itself asks, and keeps everything on your device. No password, no server.

Not affiliated with Instagram or Meta. See [PRIVACY.md](PRIVACY.md).

## Ways to use it

| | Where | Setup |
| --- | --- | --- |
| **Android app** | Phones, Android 8+ | Install the APK from [Releases](../../releases), open it, log in to Instagram inside it. |
| **Chrome / Edge / Brave extension** | Desktop | Load the `extension/` folder unpacked (see below). |
| **Userscript** | Firefox for Android with Violentmonkey, desktop browsers with Tampermonkey | Install `dist/follow-back-checker.user.js`. |
| **Bookmarklet** | Any browser, nothing to install | Make a bookmark whose address is the content of `dist/bookmarklet.txt`, open it while on instagram.com. |
| **Export reader** | Any browser, offline | Open `web/index.html` and drop the "Download your information" zip from Instagram. |

The panel is in Arabic when the browser is, English otherwise, with a toggle in its header.

### Android app

1. Download the latest `FollowCheck-*.apk` from [Releases](../../releases) on the phone.
2. Open it. Android asks once to allow installs from this source, and Google Play Protect scans the file for a few seconds. That scan happens for every app installed outside the Play Store; it ends with **Install**.
3. Open Follow Check, log in to Instagram as usual, then tap the **Follow check** button at the bottom.

The app is a single screen with Instagram's website inside it and the checker injected into every page. On start it fetches the latest checker from this repository, so fixes arrive without a reinstall.

### Desktop extension

1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode**, click **Load unpacked**, pick the `extension/` folder.
3. Open instagram.com and click **Follow check** at the bottom right, or the extension's toolbar icon.

## What the panel does

- **Check now** fetches your following list, then your followers, 200 per request with a 1 to 3 second pause between requests. A couple of thousand accounts take about a minute.
- Four tiles: don't follow you back, you don't follow back, follow each other, history. Usernames open the profile in a new tab. Tick a row to mark it handled.
- **History** records a point per check and an event per change (followed you, unfollowed you, you followed, you unfollowed), each dated by the check that noticed it, with a chart of followers and following over time.
- **On any profile page** a pill says whether that account follows you, answered from your last check with no request; tap it for a live answer.
- **Protected accounts**: accounts you follow on purpose (friends, brands, news) stay out of "don't follow you back". Tap Protect on a row, or paste and import lists; export them as JSON.
- **Filters and downloads**: profile pictures on every row, a verified tag, filters for verified/private/public accounts, and a CSV download of any list or of the history (the Android app saves it to Downloads).
- **Unfollow and Follow back, one at a time**: an Unfollow button on each row of "don't follow you back" and a Follow back button on each row of "you don't follow back". Two taps to confirm, 20 seconds between actions, at most 30 per hour and 100 per day, and it pauses for two hours if Instagram refuses. Right before each action the tool asks Instagram about that one account, so a days-old list cannot cause a wrong one: if the account follows you by now, or you already stopped following it, nothing is sent and the lists are corrected instead. The lists and the history update right away.
- **Who unfollowed you**: accounts that followed you and later left carry a dated chip wherever they appear, including "you don't follow back" ("unfollowed you on …, back now") and the profile pill, with a filter for only them.
- **Pending requests**: follow requests you sent to private accounts that were never accepted. Instagram's site no longer lists them, so the panel keeps the ones sent from here and lets you import the `pending_follow_requests` file from Instagram's "Download your information" export. Each row has a live "Still pending?" check and a Cancel request button under the same limits as Unfollow.
- **Counts and odds**: a Load counts button fetches followers and following for the accounts shown, one paced request each, at most 60 per tap, cached for two weeks. Each row then shows `3.5K · 95`, marked when the account is unlikely to follow back (a big account following ten times fewer than follow it, or following nobody) or likely (close to even), and the list can be sorted by most followers or least likely to follow back.
- **Actions log**: every unfollow, follow back, request and cancelled request made from the panel, with the date and an Undo button that performs the opposite under the same limits. CSV download.
- Several Instagram accounts in one browser are kept apart; the panel follows whoever is logged in.

## Keep it safe

These are Instagram's internal web endpoints, not an official API. The tool paces itself and backs off when Instagram says "slow down". The only actions it ever performs on your account are the unfollow, follow back, request cancel or undo you ask for by tapping the button on one row and confirming it: never in bulk, 20 seconds apart, at most 30 actions per hour and 100 per day, checked with Instagram right before and verified afterwards, and paused for two hours if Instagram objects. No likes, no messages. Run a check every few days, not every hour.

## Development

```sh
npm test        # unit tests for the pure logic, the translations and the bundle
npm run build   # dist/checker.js, dist/follow-back-checker.user.js, dist/bookmarklet.txt, android assets
```

Layout:

- `extension/` is the source of truth: `core.js` (pure logic), `i18n.js` (strings), `styles.js` (CSS), `content.js` (panel and requests), `background.js`, `manifest.json`.
- `scripts/build.js` concatenates the sources into one file for the other hosts. Built files are committed; CI fails if they are stale.
- `android/` is the app (Kotlin, one activity with a WebView). CI builds it; a `v*` tag builds a signed release and attaches the APK.
- `web/index.html` is the offline export reader.
- `tests/` run with Node's built-in test runner.

If Instagram changes its site, the endpoints and headers are in the `API` constant at the top of `extension/content.js`.

### Releasing

```sh
npm run build && git commit -am "release: 1.x.y" && git tag v1.x.y && git push && git push --tags
```

The release workflow signs the APK with the keystore kept in the repository secrets (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`).
