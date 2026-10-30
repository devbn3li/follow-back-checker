# Privacy

Follow Back Checker runs entirely inside your own browser session on instagram.com, or inside the Android app's own browser window.

- It never asks for your Instagram password. You log in on Instagram's own page.
- It sends requests only to instagram.com: the same requests the website makes when you scroll a followers list, plus the follow or unfollow request the website makes when you tap Follow back or Unfollow, which this tool only sends for one account at a time after you confirm it.
- Your follower lists, history and settings are stored only on your device: in the extension's storage, in the site's local storage (userscript and bookmarklet), or in files private to the Android app. If Android backup is on for your Google account, Android copies the app's files there like any other app's, and brings them back on a new phone.
- Nothing is sent to the author or to any third party. There is no server, no analytics and no crash reporting.
- The Android app downloads the latest checker script from this repository over HTTPS so fixes reach you without reinstalling, and asks GitHub for the latest release to offer updates. Those are the only requests it makes outside instagram.com.
- Uninstalling the extension or the app deletes everything it stored.

This project is not affiliated with Instagram or Meta.
