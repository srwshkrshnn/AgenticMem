console.log('[AgenticMem] popup script loaded');

const statusEl = document.getElementById('status');
const pingBtn = document.getElementById('pingBtn');
const retrieveBtn = document.getElementById('retrieveMemoriesBtn');

retrieveBtn?.addEventListener('click', () => {
  statusEl.textContent = 'Retrieving...';
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      const activeTab = tabs?.[0];
      console.log('[AgenticMem][popup] Active tab query result:', activeTab);
      sendGetCurrentMessages(activeTab.id);
    });
  } catch (e) {
    statusEl.textContent = 'Error (exception)';
    console.error('[AgenticMem][popup] Exception during retrieve', e);
  }
});

function sendGetCurrentMessages(tabId) {
  console.log('[AgenticMem][popup] Sending GET_CURRENT_MESSAGES to tab', tabId);
  chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_MESSAGES', ts: Date.now() }, response => {
    if (chrome.runtime.lastError) {
      console.warn('[AgenticMem][popup] sendMessage error', chrome.runtime.lastError);
      statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
      return;
    }
    statusEl.textContent = 'Got current messages';
    console.log('[AgenticMem] get current messages response', response);
  });
}
