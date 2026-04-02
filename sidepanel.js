const frameA = document.getElementById("hn-frame-a");
const frameB = document.getElementById("hn-frame-b");

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
