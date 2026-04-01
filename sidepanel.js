const iframe = document.getElementById("hn-frame");

function loadItem(id) {
  iframe.classList.remove("loaded");
  iframe.src = `https://news.ycombinator.com/item?id=${id}`;
}

iframe.addEventListener("load", () => {
  iframe.classList.add("loaded");
});

// Listen for the background script telling us which HN item to load.
browser.runtime.onMessage.addListener((message) => {
  if (message.type === "load-hn-item" && message.id) {
    loadItem(message.id);
  }
});

// On first load, ask the background for the current tab's hnid.
browser.runtime.sendMessage({ type: "get-hn-id" }).then((response) => {
  if (response && response.id) {
    loadItem(response.id);
  }
});
