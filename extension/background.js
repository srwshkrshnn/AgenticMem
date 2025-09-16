// background service worker for AgenticMem
// Runs in MV3 service worker context
console.log('[AgenticMem] background service worker loaded');

chrome.runtime.onInstalled.addListener(details => {
  console.log('[AgenticMem] onInstalled', details);
});
