hasAllUrlsPermission = () => {
  return browser.permissions.getAll().then((permissions) => {
    return permissions.origins.indexOf("<all_urls>") > -1;
  });
};

requestAllUrlsPermission = () => {
  return browser.permissions.request({ origins: ["<all_urls>"] });
};

hasPermission = () => {
  return browser.permissions.getAll().then((permissions) => {
    return permissions.origins.indexOf("https://news.ycombinator.com/*") > -1;
  });
};

requestPermission = () => {
  return browser.permissions.request({
    origins: ["https://news.ycombinator.com/*"],
  });
};

async function setup() {
  if (!(await hasPermission())) {
    const requestPermissionButton = document.getElementById("permissions");
    requestPermissionButton.addEventListener("click", () => {
      requestPermission().then(() => {
        requestPermissionButton.style.display = "none";
        browser.tabs.reload();
        setup();
      });
    });
    requestPermissionButton.style.display = "block";
    return;
  }

  const settings = await browser.storage.sync.get("disabledDomains");
  const tab = (
    await browser.tabs.query({ active: true, lastFocusedWindow: true })
  )[0];
  const url = new URL(tab.url);

  // Check if this tab has HN content and the panel isn't already open.
  const openPanelButton = document.getElementById("open-panel");
  const response = await browser.runtime.sendMessage({ type: "get-hn-id" });
  if (response && response.id) {
    openPanelButton.style.display = "block";
    openPanelButton.addEventListener("click", () => {
      const openFn = browser.sidePanel
        ? browser.sidePanel.open({ tabId: tab.id })
        : browser.sidebarAction.open();
      openFn.then(() => window.close()).catch(() => {});
    });
  }

  const toggleHostButton = document.getElementById("toggle-host");
  toggleHostButton.addEventListener("click", () => {
    if (!settings.disabledDomains) {
      settings.disabledDomains = {};
    }
    settings.disabledDomains[url.hostname] =
      !settings.disabledDomains[url.hostname];
    browser.storage.sync
      .set({
        disabledDomains: settings.disabledDomains,
      })
      .then(() => {
        browser.tabs.reload();
        toggleHostButton.innerHTML = `<b>${
          settings.disabledDomains[url.hostname] ? "Enable" : "Disable"
        }</b> for <code>${url.hostname}</code>`;
      });
  });

  toggleHostButton.innerHTML = `<b>${
    settings.disabledDomains && settings.disabledDomains[url.hostname]
      ? "Enable"
      : "Disable"
  }</b> for <code>${url.hostname}</code>`;

  // Keep open checkbox
  const persistLabel = document.getElementById("persist-label");
  const persistCheckbox = document.getElementById("persist");
  const persistSettings = await browser.storage.sync.get("persistSidePanel");
  persistCheckbox.checked = persistSettings.persistSidePanel || false;
  persistLabel.style.display = "flex";
  persistCheckbox.addEventListener("change", () => {
    browser.storage.sync.set({ persistSidePanel: persistCheckbox.checked });
  });

  const sourceCodeLink = document.getElementById("source-code-link");
  const ltgLink = document.getElementById("ltg-link");
  sourceCodeLink.style.display = "block";
  ltgLink.style.display = "block";
  if (url.hostname === "news.ycombinator.com") {
    toggleHostButton.style.display = "none";
  } else {
    toggleHostButton.style.display = "block";
  }
}

setup();
