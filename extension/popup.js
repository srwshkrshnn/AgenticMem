import { authService } from './src/services/auth.service.js';

console.log('[AgenticMem] popup script loaded');

// Initialize the auth service and UI when popup opens
document.addEventListener('DOMContentLoaded', async () => {
    await authService.init();
    await initializeUI();
});

const statusEl = document.getElementById('status');
const retrieveBtn = document.getElementById('retrieveMemoriesBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfoEl = document.getElementById('userInfo');
const authActionsEl = document.getElementById('authActions');
const appActionsEl = document.getElementById('appActions');

// Initialize UI based on auth state
async function initializeUI() {
    const isAuthenticated = authService.isAuthenticated();
    loginBtn.classList.toggle('hidden', isAuthenticated);
    logoutBtn.classList.toggle('hidden', !isAuthenticated);
    appActionsEl.classList.toggle('hidden', !isAuthenticated);
    
    if (isAuthenticated) {
        const user = authService.getUser();
        userInfoEl.textContent = `Signed in as ${user.displayName || user.userPrincipalName}`;
        userInfoEl.classList.remove('hidden');
        statusEl.textContent = 'Ready';
    } else {
        userInfoEl.classList.add('hidden');
        statusEl.textContent = 'Please sign in to continue';
    }
}

// Handle login
loginBtn?.addEventListener('click', async () => {
    try {
        statusEl.textContent = 'Signing in...';
        await authService.login();
        await initializeUI();
    } catch (error) {
        console.error('[AgenticMem][popup] Login failed:', error);
        statusEl.textContent = 'Sign in failed';
        statusEl.classList.add('error');
    }
});

// Handle logout
logoutBtn?.addEventListener('click', async () => {
    try {
        statusEl.textContent = 'Signing out...';
        await authService.logout();
        await initializeUI();
    } catch (error) {
        console.error('[AgenticMem][popup] Logout failed:', error);
        statusEl.textContent = 'Sign out failed';
        statusEl.classList.add('error');
    }
});

// Handle retrieve memories
retrieveBtn?.addEventListener('click', async () => {
    if (!authService.isAuthenticated()) {
        statusEl.textContent = 'Please sign in first';
        statusEl.classList.add('error');
        return;
    }

    statusEl.textContent = 'Retrieving...';
    try {
        const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
        const activeTab = tabs?.[0];
        
        if (!activeTab?.id) {
            statusEl.textContent = 'No active tab';
            return;
        }

        const latestMessage = await sendGetCurrentMessages(activeTab.id);
        if (!latestMessage) {
            statusEl.textContent = 'No latest messages';
            return;
        }

        await retrieveMemories(latestMessage);
    } catch (e) {
        statusEl.textContent = 'Error retrieving memories';
        statusEl.classList.add('error');
        console.error('[AgenticMem][popup] Exception during retrieve', e);
    }
});

async function sendGetCurrentMessages(tabId) {
  console.log('[AgenticMem][popup] Checking content script status for tab', tabId);
  
  // First, verify we're on a supported page
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://chatgpt.com')) {
    throw new Error('Please open ChatGPT to use this feature');
  }

  // Try to ping the content script
  try {
    await pingContentScript(tabId);
  } catch (error) {
    console.log('[AgenticMem][popup] Content script not responsive, attempting to inject');
    await injectContentScript(tabId);
    // Wait a moment for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return new Promise((resolve, reject) => {
    console.log('[AgenticMem][popup] Sending GET_CURRENT_MESSAGES to tab', tabId);
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 5000); // 5 second timeout

    chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_MESSAGES', ts: Date.now() }, response => {
      clearTimeout(timeoutId);
      
      if (chrome.runtime.lastError) {
        console.warn('[AgenticMem][popup] sendMessage error', chrome.runtime.lastError);
        return reject(new Error('Failed to communicate with ChatGPT page'));
      }

      console.log('[AgenticMem] get current messages response', response);
      if (!response?.ok) return resolve('');
      const latest = (response.latestMessages || '').trim();
      resolve(latest);
    });
  });
}

function pingContentScript(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: 'PING' }, response => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      resolve(response);
    });
  });
}

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['src/chatgpt/content.js']
    });
    console.log('[AgenticMem][popup] Content script injected successfully');
  } catch (error) {
    console.error('[AgenticMem][popup] Failed to inject content script:', error);
    throw new Error('Failed to initialize extension on this page');
  }
}

async function retrieveMemories(queryText, topK = 5) {
  if (!queryText) {
    statusEl.textContent = 'Empty query';
    return;
  }

  if (!authService.isAuthenticated()) {
    statusEl.textContent = 'Please sign in first';
    statusEl.classList.add('error');
    return;
  }

  try {
    statusEl.textContent = 'Retrieving memories...';
    const params = new URLSearchParams({ q: queryText, top_k: String(topK) });
    const url = `/api/memories/retrieve/?${params.toString()}`;
    
    const response = await authService.makeAuthenticatedRequest(url, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();
    console.log('[AgenticMem][popup] Retrieval result', data);
    statusEl.textContent = Array.isArray(data) ? `Retrieved ${data.length} memories` : 'Retrieved';
    
    // Forward memories to content script to inject into conversation UI
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs?.[0];
    if (!activeTab?.id) {
      throw new Error('No active tab found');
    }

    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'APPEND_MEMORIES', memories: data, ts: Date.now() },
        response => {
          if (chrome.runtime.lastError) {
            console.warn('[AgenticMem][popup] Could not send APPEND_MEMORIES', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          console.log('[AgenticMem][popup] APPEND_MEMORIES ack', response);
          resolve(response);
        }
      );
    });
  } catch (err) {
    console.error('[AgenticMem][popup] Retrieval failed', err);
    statusEl.textContent = err.message || 'Retrieve error';
    statusEl.classList.add('error');
  }
}
