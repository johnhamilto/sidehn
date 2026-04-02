// Only apply inside iframes (the side panel), not on the main HN page.
if (window !== window.top) {
  // Mark the html element so CSS can target iframe-only styles.
  document.documentElement.classList.add("sidehn-iframe");
}
