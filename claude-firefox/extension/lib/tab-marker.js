// Functions to visually mark Claude-managed tabs

const BADGE_TEXT = "AI";
const BADGE_COLOR = "#e2b340";
const TITLE_PREFIX = "[Claude] ";

export async function markTab(tabId) {
  try {
    await browser.action.setBadgeText({ text: BADGE_TEXT, tabId });
    await browser.action.setBadgeBackgroundColor({ color: BADGE_COLOR, tabId });
    const tab = await browser.tabs.get(tabId);
    if (tab.title && !tab.title.startsWith(TITLE_PREFIX)) {
      await browser.scripting.executeScript({
        target: { tabId },
        func: (prefix) => { document.title = prefix + document.title; },
        args: [TITLE_PREFIX],
      }).catch(() => {
        // scripting may fail on privileged pages, that's ok
      });
    }
  } catch (e) {
    // Tab may have been closed
  }
}

export async function unmarkTab(tabId) {
  try {
    await browser.action.setBadgeText({ text: "", tabId });
    const tab = await browser.tabs.get(tabId);
    if (tab.title && tab.title.startsWith(TITLE_PREFIX)) {
      await browser.scripting.executeScript({
        target: { tabId },
        func: (prefix) => {
          if (document.title.startsWith(prefix)) {
            document.title = document.title.slice(prefix.length);
          }
        },
        args: [TITLE_PREFIX],
      }).catch(() => {});
    }
  } catch (e) {
    // Tab may have been closed
  }
}

export function setupTitleObserver(tabId) {
  // Re-apply prefix when tab title changes (e.g., after page navigations)
  // Debounce to avoid excessive script injection on rapid title changes
  let debounceTimer = null;

  const listener = (updatedTabId, changeInfo) => {
    if (updatedTabId === tabId && changeInfo.title && !changeInfo.title.startsWith(TITLE_PREFIX)) {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        browser.scripting.executeScript({
          target: { tabId },
          func: (prefix) => { document.title = prefix + document.title; },
          args: [TITLE_PREFIX],
        }).catch(() => {});
      }, 1000);
    }
  };
  browser.tabs.onUpdated.addListener(listener);

  // Clean up listener when tab is closed
  const removeListener = (closedTabId) => {
    if (closedTabId === tabId) {
      clearTimeout(debounceTimer);
      browser.tabs.onUpdated.removeListener(listener);
      browser.tabs.onRemoved.removeListener(removeListener);
    }
  };
  browser.tabs.onRemoved.addListener(removeListener);
}
