async function setup() {
  if (location.hostname !== "news.ycombinator.com") return;
  if (window !== window.top) return;

  // Match the page background to #hnmain's bgcolor so the full
  // sidebar area is filled, even when the page content is short.
  const hnmain = document.getElementById("hnmain");
  if (hnmain) {
    document.documentElement.style.backgroundColor =
      hnmain.getAttribute("bgcolor") || "#f6f6ef";
  }

  // Intercept clicks on article links to open the side panel.
  const api = typeof browser !== "undefined" ? browser : chrome;
  document.addEventListener("click", (e) => {
    const link = e.target.closest("a");
    if (!link) return;

    // Find the parent story row to get the HN item ID.
    const row = link.closest("tr.athing");
    if (row && row.id) {
      api.runtime.sendMessage({
        type: "hn-link-clicked",
        id: row.id,
        hostname: new URL(link.href, location.href).hostname,
      });
      return;
    }

    // Also handle clicks on "N comments" links (e.g. from comment pages).
    const itemMatch = link.href && link.href.match(/item\?id=(\d+)/);
    if (itemMatch && !link.href.includes("news.ycombinator.com")) {
      api.runtime.sendMessage({
        type: "hn-link-clicked",
        id: itemMatch[1],
        hostname: new URL(link.href, location.href).hostname,
      });
    }
  });
}

setup();
