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
      if (!activeTab?.id) {
        statusEl.textContent = 'No active tab';
        return;
      }
      sendGetCurrentMessages(activeTab.id)
        .then(latestMessage => {
          if (!latestMessage) {
            statusEl.textContent = 'No latest messages';
            return;
          }
          retrieveMemories(latestMessage);
        })
        .catch(err => {
          console.error('[AgenticMem][popup] getCurrentMessages failed', err);
          statusEl.textContent = 'Error retrieving messages';
        });
    });
  } catch (e) {
    statusEl.textContent = 'Error (exception)';
    console.error('[AgenticMem][popup] Exception during retrieve', e);
  }
});

function sendGetCurrentMessages(tabId) {
  return new Promise((resolve, reject) => {
    console.log('[AgenticMem][popup] Sending GET_CURRENT_MESSAGES to tab', tabId);
    chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_MESSAGES', ts: Date.now() }, response => {
      if (chrome.runtime.lastError) {
        console.warn('[AgenticMem][popup] sendMessage error', chrome.runtime.lastError);
        return reject(chrome.runtime.lastError);
      }
      console.log('[AgenticMem] get current messages response', response);
      if (!response?.ok) return resolve('');
      const latest = (response.latestMessages || '').trim();
      resolve(latest);
    });
  });
}

function retrieveMemories(queryText, topK = 5) {
  if (!queryText) {
    statusEl.textContent = 'Empty query';
    return;
  }
  statusEl.textContent = 'Retrieving memories...';
  const params = new URLSearchParams({ q: queryText, top_k: String(topK) });
  const url = `http://localhost:8000/api/memories/retrieve/?${params.toString()}`;
  fetch(url, { method: 'GET' })
    .then(r => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(() => ({ raw: 'non-json response' }));
    })
    .then(data => {
      console.log('[AgenticMem][popup] Retrieval result', data);
      statusEl.textContent = Array.isArray(data) ? `Retrieved ${data.length} memories` : 'Retrieved';
    })
    .catch(err => {
      console.error('[AgenticMem][popup] Retrieval failed', err);
      statusEl.textContent = 'Retrieve error';
    });
}
