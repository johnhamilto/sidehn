function addHashIDs() {
  var hnItems = document.querySelectorAll("tr.athing");
  if (hnItems.length === 0) {
    hnItems = document.querySelectorAll(".hn-item");
  }

  hnItems.forEach((item) => {
    const link =
      item.querySelector("span.titleline > a") ||
      item.querySelector("a.hn-item-title");
    if (!link) return;
    if (!link.href.includes("news.ycombinator.com")) {
      const url = new URL(link.href);
      url.searchParams.set("hnid", item.id);
      link.href = url.toString();
    }
  });
}

async function setup() {
  const settings = await browser.storage.sync.get("disabledDomains");

  if (location.hostname !== "news.ycombinator.com") {
    if (
      settings.disabledDomains &&
      settings.disabledDomains[location.hostname]
    ) {
      return;
    }

    const hnidMatch = location.search.match(/[?&]hnid=(\d+)/);
    if (hnidMatch) {
      browser.runtime.sendMessage({ type: "open-side-panel", id: hnidMatch[1] });
    }
    return;
  }

  // Match the page background to #hnmain's bgcolor so the full
  // sidebar area is filled, even when the page content is short.
  const hnmain = document.getElementById("hnmain");
  if (hnmain) {
    document.documentElement.style.backgroundColor =
      hnmain.getAttribute("bgcolor") || "#f6f6ef";
  }

  // Listen for clicks on HN article links to auto-open the side panel.
  // The message must originate from a real click for Chrome to allow sidePanel.open().
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;
    const url = new URL(link.href, location.href);
    const hnid = url.searchParams.get("hnid");
    if (hnid) {
      browser.runtime.sendMessage({ type: "hn-link-clicked", id: hnid });
    }
  });

  const observer = new MutationObserver(addHashIDs);
  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
  addHashIDs();
}

setup();
