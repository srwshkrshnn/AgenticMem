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
      sendRetrieve(activeTab.id);
    });
  } catch (e) {
    statusEl.textContent = 'Error (exception)';
    console.error('[AgenticMem][popup] Exception during retrieve', e);
  }
});

function sendRetrieve(tabId) {
  console.log('[AgenticMem][popup] Sending RETRIEVE_MEMORIES to tab', tabId);
  chrome.tabs.sendMessage(tabId, { type: 'RETRIEVE_MEMORIES', ts: Date.now() }, response => {
    if (chrome.runtime.lastError) {
      console.warn('[AgenticMem][popup] sendMessage error', chrome.runtime.lastError);
      statusEl.textContent = 'Error: ' + chrome.runtime.lastError.message;
      return;
    }
    statusEl.textContent = 'Retrieved';
    console.log('[AgenticMem] retrieve response', response);
  });
}
