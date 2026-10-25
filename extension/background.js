// The panel asks for the latest release through here: instagram.com's own page rules would block
// that request from the page, and the service worker has no such rules. Nothing else is sent.
const RELEASE_API = 'https://api.github.com/repos/devbn3li/follow-back-checker/releases/latest';
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== 'fbc-release') return false;
  fetch(RELEASE_API, { headers: { accept: 'application/vnd.github+json' } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => sendResponse({ ok: !!data, release: data }), () => sendResponse({ ok: false, release: null }));
  return true; // answered once the request is back
});

// Toolbar icon: open the panel on the current instagram.com tab, or open instagram.com.
chrome.action.onClicked.addListener(async (tab) => {
  const onInstagram = !!(tab && tab.id != null && typeof tab.url === 'string' && tab.url.startsWith('https://www.instagram.com/'));
  if (!onInstagram) {
    chrome.tabs.create({ url: 'https://www.instagram.com/' });
    return;
  }
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'fbc-toggle' });
  } catch (e) {
    // The tab was open before the extension was installed, so the content script is not there yet.
    chrome.tabs.reload(tab.id);
  }
});
