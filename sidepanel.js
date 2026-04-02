const frameA = document.getElementById("hn-frame-a");
const frameB = document.getElementById("hn-frame-b");
const disableBtn = document.getElementById("disable-domain");
const persistCheckbox = document.getElementById("persist");
const gearBtn = document.getElementById("gear");
const controls = document.getElementById("controls");

gearBtn.addEventListener("click", () => {
  controls.classList.toggle("visible");
});

let currentHostname = null;
let frontFrame = frameA;
let backFrame = frameB;

// Double-buffer: load new content in the hidden iframe, then swap.
// Old content stays visible until new content is ready - no white flash.
function loadItem(id) {
  const url = `https://news.ycombinator.com/item?id=${id}`;

  // If the front frame already has this URL, don't reload.
  if (frontFrame.src === url) return;

  backFrame.onload = () => {
    backFrame.classList.remove("behind");
    backFrame.classList.add("front");
    frontFrame.classList.remove("front");
    frontFrame.classList.add("behind");

    const tmp = frontFrame;
    frontFrame = backFrame;
    backFrame = tmp;
    backFrame.onload = null;
  };
  backFrame.src = url;
}

// Disable/enable toggle for domain
disableBtn.addEventListener("click", async () => {
  if (!currentHostname) return;
  const settings = await browser.storage.sync.get("disabledDomains");
  const disabled = settings.disabledDomains || {};
  const wasDisabled = disabled[currentHostname];
  disabled[currentHostname] = !wasDisabled;
  if (!disabled[currentHostname]) delete disabled[currentHostname];
  await browser.storage.sync.set({ disabledDomains: disabled });
  updateDisableButton();
  // Tell the background to deactivate the current tab so the popup is restored.
  if (!wasDisabled) {
    browser.runtime.sendMessage({ type: "domain-disabled" });
  }
});

// Persist checkbox
persistCheckbox.addEventListener("change", async () => {
  await browser.storage.sync.set({ persistSidePanel: persistCheckbox.checked });
  browser.runtime.sendMessage({
    type: "persist-changed",
    value: persistCheckbox.checked,
  });
});

// Load saved persist setting
browser.storage.sync.get("persistSidePanel").then((settings) => {
  persistCheckbox.checked = settings.persistSidePanel || false;
});

// Listen for the background script telling us which HN item to load.
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "load-hn-item" && message.id) {
    loadItem(message.id);
  }
  if (message.type === "update-hostname") {
    currentHostname = message.hostname;
    updateDisableButton();
  }
});

async function updateDisableButton() {
  if (!currentHostname) {
    disableBtn.style.display = "none";
    return;
  }
  const settings = await browser.storage.sync.get("disabledDomains");
  const isDisabled =
    settings.disabledDomains && settings.disabledDomains[currentHostname];
  disableBtn.style.display = "";
  disableBtn.textContent = isDisabled
    ? `Enable for ${currentHostname}`
    : `Disable for ${currentHostname}`;
}

// On first load, ask the background for the current tab's hnid and hostname.
browser.runtime.sendMessage({ type: "get-hn-id" }).then((response) => {
  if (response && response.id) {
    loadItem(response.id);
  }
  if (response && response.hostname) {
    currentHostname = response.hostname;
    updateDisableButton();
  }
});
