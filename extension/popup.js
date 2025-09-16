console.log('[AgenticMem] popup script loaded');

const statusEl = document.getElementById('status');
const pingBtn = document.getElementById('pingBtn');

pingBtn.addEventListener('click', () => {
  statusEl.textContent = 'Pinging background...';
  chrome.runtime.sendMessage({ type: 'PING', ts: Date.now() }, response => {
    statusEl.textContent = 'Background response: ' + JSON.stringify(response);
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'PONG') {
    statusEl.textContent = 'Received PONG from background';
    sendResponse({ ok: true });
  }
});
