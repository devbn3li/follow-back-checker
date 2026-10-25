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
