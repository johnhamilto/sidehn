if (!('browser' in self)) {
  self.browser = self.chrome;
}

// Track hnid per tab.
const tabHnids = new Map();

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

function activateTab(tabId, hnid) {
  console.log(`[SideHN] activateTab ${tabId} with hnid=${hnid}`);
  tabHnids.set(tabId, hnid);
  browser.action.setPopup({ tabId, popup: "" });
  browser.action.setBadgeText({ tabId, text: "HN" });
  browser.action.setBadgeBackgroundColor({ tabId, color: "#ff6600" });
  browser.sidePanel.setOptions({ tabId, path: "sidepanel.html", enabled: true });

  // Update an already-open side panel.
  browser.runtime.sendMessage({
    type: "load-hn-item",
    id: hnid,
  }).catch(() => {});
}

function deactivateTab(tabId) {
  console.log(`[SideHN] deactivateTab ${tabId}`);
  tabHnids.delete(tabId);
  browser.action.setPopup({ tabId, popup: "popup.html" });
  browser.action.setBadgeText({ tabId, text: "" });
  browser.sidePanel.setOptions({ tabId, enabled: false }).catch(() => {});
}

// Capture hnid from navigation URLs before server redirects can strip them.
browser.webNavigation.onBeforeNavigate.addListener((details) => {
  if (details.frameId !== 0) return;
  try {
    const url = new URL(details.url);
    const hnid = url.searchParams.get("hnid");
    if (hnid) {
      activateTab(details.tabId, hnid);
    }
  } catch (e) {}
});

// Handle messages from content scripts and the side panel.
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "open-side-panel" && message.id) {
    activateTab(sender.tab.id, message.id);
  }

  if (message.type === "hn-link-clicked" && message.id) {
    const tabId = sender.tab.id;
    activateTab(tabId, message.id);
    browser.sidePanel.open({ tabId }).catch((err) => {
      console.log(`[SideHN] auto-open failed:`, err);
    });
  }

  if (message.type === "get-hn-id") {
    browser.tabs.query({ active: true, lastFocusedWindow: true }).then((tabs) => {
      const id = tabs[0] ? tabHnids.get(tabs[0].id) : null;
      sendResponse({ id });
    });
    return true;
  }
});

// React to tab navigation - deactivate when returning to HN or leaving an hnid page.
browser.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === "complete") {
    setupCookies();
  }

  if (changeInfo.url) {
    console.log(`[SideHN] tab ${tabId} URL changed to ${changeInfo.url}`);
    const url = new URL(changeInfo.url);
    if (url.hostname === "news.ycombinator.com") {
      deactivateTab(tabId);
    } else if (!url.searchParams.get("hnid") && !tabHnids.has(tabId)) {
      deactivateTab(tabId);
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  tabHnids.delete(tabId);
});

// When the icon is clicked (popup disabled for this tab), open the side panel.
browser.action.onClicked.addListener((tab) => {
  console.log(`[SideHN] action.onClicked for tab ${tab.id}`);
  browser.sidePanel.open({ tabId: tab.id }).then(() => {
    console.log(`[SideHN] sidePanel.open succeeded`);
  }).catch((err) => {
    console.error(`[SideHN] sidePanel.open failed:`, err);
  });
});

setupCookies();
