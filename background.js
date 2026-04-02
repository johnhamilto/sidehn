if (!('browser' in self)) {
  self.browser = self.chrome;
}

// Track hnid and hostname per tab.
const tabHnids = new Map();
const tabHostnames = new Map();
let lastHnid = null;
let lastHostname = null;
let persist = false;
let disabledDomains = {};

// Load settings into memory.
browser.storage.sync.get(["persistSidePanel", "disabledDomains"]).then((settings) => {
  persist = settings.persistSidePanel || false;
  disabledDomains = settings.disabledDomains || {};
});

// Keep in-memory cache in sync.
browser.storage.onChanged.addListener((changes) => {
  if (changes.disabledDomains) {
    disabledDomains = changes.disabledDomains.newValue || {};
  }
  if (changes.persistSidePanel) {
    persist = changes.persistSidePanel.newValue || false;
  }
});

async function toggleCookieIframeInjector(cookie) {
  var cookie =
    cookie !== undefined
      ? cookie
      : await browser.cookies.get({
          url: "https://news.ycombinator.com",
          name: "user",
        });

  if (!cookie) {
    console.log("Removing cookie iframe injector");
    browser.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [5],
    });
    return;
  }

  console.log(`Adding cookie iframe injector`);
  browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [5],
    addRules: [
      {
        id: 5,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            {
              header: "Cookie",
              operation: "set",
              value: `user=${cookie.value}`,
            },
            {
              header: "Sec-Fetch-Dest",
              operation: "set",
              value: "document",
            },
            {
              header: "Sec-Fetch-Site",
              operation: "set",
              value: "same-origin",
            },
            {
              header: "Referer",
              operation: "set",
              value: "https://news.ycombinator.com/",
            },
          ],
        },
        condition: {
          urlFilter: "||news.ycombinator.com",
          resourceTypes: ["sub_frame"],
        },
      },
    ],
  });
}

async function handleCookieChange(changeInfo) {
  if (
    changeInfo.cookie.domain !== "news.ycombinator.com" ||
    !changeInfo.cookie.name !== "user"
  ) {
    return;
  }
  console.log(
    `Cookie changed: \n` +
      ` * Cookie: ${JSON.stringify(changeInfo.cookie)}\n` +
      ` * Cause: ${changeInfo.cause}\n` +
      ` * Removed: ${changeInfo.removed}`
  );
  toggleCookieIframeInjector(changeInfo.removed ? null : changeInfo.cookie);
}

async function setupCookies() {
  if (browser.cookies.onChanged.hasListener(handleCookieChange)) {
    console.log("Already listening for cookie changes");
    await toggleCookieIframeInjector();
    return;
  }

  console.log("Adding listener for cookie changes");
  browser.cookies.onChanged.addListener(handleCookieChange);
  await toggleCookieIframeInjector();
}

function activateTab(tabId, hnid, hostname) {
  const prevHnid = tabHnids.get(tabId);
  tabHnids.set(tabId, hnid);
  lastHnid = hnid;
  if (hostname) {
    tabHostnames.set(tabId, hostname);
    lastHostname = hostname;
  }
  browser.action.setBadgeText({ tabId, text: "HN" });
  browser.action.setBadgeBackgroundColor({ tabId, color: "#ff6600" });

  // Only reload the side panel iframe if the hnid actually changed.
  if (prevHnid !== hnid) {
    browser.runtime.sendMessage({
      type: "load-hn-item",
      id: hnid,
    }).catch(() => {});
  }
  if (hostname) {
    browser.runtime.sendMessage({
      type: "update-hostname",
      hostname,
    }).catch(() => {});
  }
}

function deactivateTab(tabId) {
  if (persist) return;

  tabHnids.delete(tabId);
  tabHostnames.delete(tabId);
  browser.action.setBadgeText({ tabId, text: "" });

  // Close the panel. Use close() if available (Chrome 141+), fall back to per-tab disable.
  if (browser.sidePanel.close) {
    browser.tabs.get(tabId).then((tab) => {
      browser.sidePanel.close({ windowId: tab.windowId }).catch(() => {});
    }).catch(() => {});
  } else {
    browser.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
  }
}

// Handle messages from content scripts and the side panel.
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "hn-link-clicked" && message.id) {
    if (disabledDomains[message.hostname]) return;
    const tabId = sender.tab.id;
    activateTab(tabId, message.id, message.hostname);
    browser.sidePanel.open({ tabId }).catch((err) => {
      console.log(`[SideHN] auto-open failed:`, err);
    });
  }

  if (message.type === "get-hn-id") {
    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
      const tabId = tabs[0] ? tabs[0].id : null;
      const id = (tabId && tabHnids.get(tabId)) || (persist ? lastHnid : null);
      const hostname = (tabId && tabHostnames.get(tabId)) || (persist ? lastHostname : null);
      sendResponse({ id, hostname });
    });
    return true;
  }


  if (message.type === "domain-disabled") {
    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
      if (!tabs[0]) return;
      const tabId = tabs[0].id;
      tabHnids.delete(tabId);
      tabHostnames.delete(tabId);
      browser.action.setBadgeText({ tabId, text: "" });
      if (browser.sidePanel.close) {
        browser.sidePanel.close({ windowId: tabs[0].windowId }).catch(() => {});
      }
    });
  }
});

// React to tab navigation.
browser.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === "complete") {
    setupCookies();
  }

  if (changeInfo.url) {
    const url = new URL(changeInfo.url);
    if (url.hostname === "news.ycombinator.com") {
      deactivateTab(tabId);
    }
  }
});

// Handle tab switching - update content via messages, never reload the panel.
browser.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;

  if (tabHnids.has(tabId)) {
    browser.runtime.sendMessage({
      type: "load-hn-item",
      id: tabHnids.get(tabId),
    }).catch(() => {});
    const hostname = tabHostnames.get(tabId);
    if (hostname) {
      browser.runtime.sendMessage({
        type: "update-hostname",
        hostname,
      }).catch(() => {});
    }
  }
  // If no hnid for this tab, just leave the panel showing whatever it has.
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabHnids.delete(tabId);
  tabHostnames.delete(tabId);
});

// Ensure the icon click shows the popup, not the side panel.
browser.sidePanel.setPanelBehavior({ openPanelOnActionClick: false });
setupCookies();
