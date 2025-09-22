import { authService } from './src/services/auth.service.js';

console.log('[Pensieve] popup script loaded');

// Elements
const statusEl = document.getElementById('status');
const retrieveBtn = document.getElementById('retrieveMemoriesBtn');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userInfoEl = document.getElementById('userInfo');
const appActionsEl = document.getElementById('appActions');
const memoriesListEl = document.getElementById('memoriesList');
const themeToggleBtn = document.getElementById('themeToggle');
const themeIcon = document.getElementById('themeIcon');
const extVersionEl = document.getElementById('extVersion');

// Utilities
function setStatus(message, type = '') {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.classList.remove('error', 'success');
  if (type) statusEl.classList.add(type);
}

function setLoading(btn, loading) {
  if (!btn) return;
  if (loading) {
    btn.disabled = true;
    if (!btn.dataset.originalLabel) {
      btn.dataset.originalLabel = btn.innerHTML;
    }
    btn.innerHTML = `<span class="spinner"></span>` + (btn.dataset.loadingText ? ` ${btn.dataset.loadingText}` : '');
  } else {
    btn.disabled = false;
    if (btn.dataset.originalLabel) {
      btn.innerHTML = btn.dataset.originalLabel;
    }
  }
}

function renderMemories(memories) {
  if (!memoriesListEl) return;
  if (!Array.isArray(memories) || memories.length === 0) {
    memoriesListEl.classList.add('hidden');
    memoriesListEl.innerHTML = '';
    return;
  }
  memoriesListEl.classList.remove('hidden');
  memoriesListEl.innerHTML = '';
  memories.slice(0, 25).forEach(m => {
    const li = document.createElement('li');
    li.textContent = typeof m === 'string' ? m : (m.text || m.content || JSON.stringify(m));
    memoriesListEl.appendChild(li);
  });
}

function initTheme() {
  try {
    const stored = localStorage.getItem('pensieve_theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const theme = stored || (prefersDark ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    updateThemeIcon(theme);
  } catch {}
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  try { localStorage.setItem('pensieve_theme', next); } catch {}
  updateThemeIcon(next);
}

function updateThemeIcon(theme) {
  if (!themeIcon) return;
  if (theme === 'dark') {
    themeIcon.innerHTML = '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" />';
  } else {
    themeIcon.innerHTML = '<circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="M4.22 4.22l1.42 1.42"/><path d="M18.36 18.36l1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="M4.22 19.78l1.42-1.42"/><path d="M18.36 5.64l1.42-1.42"/>';
  }
}

// Initialize when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  if (extVersionEl) {
    try { extVersionEl.textContent = chrome.runtime.getManifest().version; } catch {}
  }
  try {
    await authService.init();
  } catch (e) {
    console.warn('[Pensieve][popup] auth init failed', e);
  }
  await initializeUI();
});

// Initialize UI based on auth state
async function initializeUI() {
  const isAuthenticated = authService.isAuthenticated();
  loginBtn.classList.toggle('hidden', isAuthenticated);
  logoutBtn.classList.toggle('hidden', !isAuthenticated);
  appActionsEl.classList.toggle('hidden', !isAuthenticated);
  if (isAuthenticated) {
    const user = authService.getUser();
    userInfoEl.textContent = `Signed in as ${user.displayName || user.userPrincipalName || user.name || 'User'}`;
    userInfoEl.classList.remove('hidden');
    setStatus('Ready');
  } else {
    userInfoEl.classList.add('hidden');
    setStatus('Please sign in to continue');
    renderMemories([]);
  }
}

// Handle login
loginBtn?.addEventListener('click', async () => {
  setStatus('Signing in...');
  setLoading(loginBtn, true);
  try {
    await authService.login();
    await initializeUI();
    setStatus('Signed in', 'success');
  } catch (error) {
    console.error('[Pensieve][popup] Login failed:', error);
    setStatus('Sign in failed', 'error');
  } finally {
    setLoading(loginBtn, false);
  }
});

// Handle logout
logoutBtn?.addEventListener('click', async () => {
  setStatus('Signing out...');
  setLoading(logoutBtn, true);
  try {
    await authService.logout();
    await initializeUI();
    setStatus('Signed out', 'success');
  } catch (error) {
    console.error('[Pensieve][popup] Logout failed:', error);
    setStatus('Sign out failed', 'error');
  } finally {
    setLoading(logoutBtn, false);
  }
});

// Theme toggle
themeToggleBtn?.addEventListener('click', () => {
  toggleTheme();
});

// Handle retrieve memories
retrieveBtn?.addEventListener('click', async () => {
  if (!authService.isAuthenticated()) {
    setStatus('Please sign in first', 'error');
    return;
  }
  setStatus('Retrieving...');
  setLoading(retrieveBtn, true);
  retrieveBtn.dataset.loadingText = 'Retrieving';
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs?.[0];
    if (!activeTab?.id) {
      setStatus('No active tab', 'error');
      return;
    }
    const latestMessage = await sendGetCurrentMessages(activeTab.id);
    if (!latestMessage) {
      setStatus('No latest messages', 'error');
      return;
    }
    await retrieveMemories(latestMessage);
  } catch (e) {
    setStatus(e?.message || 'Error retrieving memories', 'error');
    console.error('[Pensieve][popup] Exception during retrieve', e);
  } finally {
    setLoading(retrieveBtn, false);
  }
});

async function sendGetCurrentMessages(tabId) {
  console.log('[Pensieve][popup] Checking content script status for tab', tabId);
  
  // First, verify we're on a supported page
  const tab = await chrome.tabs.get(tabId);
  if (!tab.url?.startsWith('https://chatgpt.com')) {
    throw new Error('Please open ChatGPT to use this feature');
  }

  // Try to ping the content script
  try {
    await pingContentScript(tabId);
  } catch (error) {
    console.log('[Pensieve][popup] Content script not responsive, attempting to inject');
    await injectContentScript(tabId);
    // Wait a moment for the script to initialize
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return new Promise((resolve, reject) => {
    console.log('[Pensieve][popup] Sending GET_CURRENT_MESSAGES to tab', tabId);
    
    const timeoutId = setTimeout(() => {
      reject(new Error('Request timed out'));
    }, 5000); // 5 second timeout

    chrome.tabs.sendMessage(tabId, { type: 'GET_CURRENT_MESSAGES', ts: Date.now() }, response => {
      clearTimeout(timeoutId);
      
      if (chrome.runtime.lastError) {
        console.warn('[Pensieve][popup] sendMessage error', chrome.runtime.lastError);
        return reject(new Error('Failed to communicate with ChatGPT page'));
      }

      console.log('[Pensieve] get current messages response', response);
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
    console.log('[Pensieve][popup] Content script injected successfully');
  } catch (error) {
    console.error('[Pensieve][popup] Failed to inject content script:', error);
    throw new Error('Failed to initialize extension on this page');
  }
}

async function retrieveMemories(queryText, topK = 5) {
  if (!queryText) {
    setStatus('Empty query', 'error');
    return;
  }
  if (!authService.isAuthenticated()) {
    setStatus('Please sign in first', 'error');
    return;
  }
  try {
    setStatus('Retrieving memories...');
    const params = new URLSearchParams({ q: queryText, top_k: String(topK) });
    const url = `/api/memories/retrieve/?${params.toString()}`;
    const response = await authService.makeAuthenticatedRequest(url, { method: 'GET' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    console.log('[Pensieve][popup] Retrieval result', data);
    if (Array.isArray(data)) {
      setStatus(`Retrieved ${data.length} memories`, 'success');
      renderMemories(data);
    } else {
      setStatus('Retrieved', 'success');
      renderMemories([]);
    }
    // Forward to content script
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs?.[0];
    if (!activeTab?.id) throw new Error('No active tab found');
    await new Promise((resolve, reject) => {
      chrome.tabs.sendMessage(
        activeTab.id,
        { type: 'APPEND_MEMORIES', memories: data, ts: Date.now() },
        response => {
          if (chrome.runtime.lastError) {
            console.warn('[Pensieve][popup] Could not send APPEND_MEMORIES', chrome.runtime.lastError);
            reject(chrome.runtime.lastError);
            return;
          }
          console.log('[Pensieve][popup] APPEND_MEMORIES ack', response);
          resolve(response);
        }
      );
    });
  } catch (err) {
    console.error('[Pensieve][popup] Retrieval failed', err);
    setStatus(err.message || 'Retrieve error', 'error');
  }
}

