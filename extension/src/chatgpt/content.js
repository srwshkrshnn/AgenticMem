console.log('[AgenticMem] Content script loaded', new Date().toISOString());

// Handle PING messages to verify content script is loaded
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PING') {
    sendResponse({ ok: true, timestamp: Date.now() });
    return true;
  }
});

// --- Selector configuration (kept as constants so adapters for other sites can override later) ---
const TEXTAREA_SELECTOR = '#prompt-textarea';
// Container that holds all messages in the ChatGPT conversation (updated CSS trail may change over time)
// Previous selector: '.flex.flex-col.text-sm.md\\:pb-9'
// New observed structure uses class list including: 'flex flex-col text-sm thread-xl:pt-header-height pb-25'
// We match on a stable subset: flex + flex-col + text-sm + pb-25
const MESSAGE_CONTAINER_SELECTOR = '.flex.flex-col.text-sm.pb-25';
// Attribute used by OpenAI to indicate author role
const ASSISTANT_ROLE_SELECTOR = '[data-message-author-role="assistant"]';
// Within an assistant message, markdown content wrapper
const ASSISTANT_CONTENT_SELECTOR = '.markdown';

let currentDraft = '';

function getTextarea() { return document.querySelector(TEXTAREA_SELECTOR); }

function isRealTextarea(el) {
  return el && el.tagName === 'TEXTAREA';
}

function getEditableRoot() {
  const ta = getTextarea();
  if (ta) return ta;
  // Fallback: look for a contentEditable region inside the composer wrapper
  const ce = document.querySelector('[contenteditable="true"]');
  return ce || ta;
}

function escapeHtml(str) {
  return (str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function updateDraft() {
  const el = getTextarea();
  if (!el) return;
  const val = (el.value !== undefined ? el.value : el.textContent) || '';
  const trimmed = val.trim();
  if (trimmed) currentDraft = trimmed; // only update if non-empty
}

function captureStoredDraft() {
  if (!currentDraft) return '';
  const captured = currentDraft;
  console.log('[AgenticMem] Captured message:', captured);
  currentDraft = '';
  return captured;
}

// Consolidated handler for when the user sends a message (Enter or send button)
async function triggerProcessMemory() {
  updateDraft();
  const draft = captureStoredDraft();
  const lastAssistant = getLastAssistantMessage();
  await sendProcessMemory(draft, lastAssistant);
}

function bindTextarea(el) {
  if (!el || el.dataset.amBound) return;
  el.dataset.amBound = '1';
  el.addEventListener('input', updateDraft, true);
  el.addEventListener('keyup', updateDraft, true);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      triggerProcessMemory();
    }
  }, true);
  updateDraft();
}

function bindSendButton(btn) {
  if (!btn || btn.dataset.amClick) return;
  btn.dataset.amClick = '1';
  btn.addEventListener('click', () => {
    triggerProcessMemory();
  }, true);
}

function bindAll() {
  bindTextarea(getTextarea());
  bindSendButton(document.querySelector('#composer-submit-button'));
}

function getLastAssistantMessage() {
  const container = document.querySelector(MESSAGE_CONTAINER_SELECTOR);
  if (!container) return '';
  const assistants = container.querySelectorAll(ASSISTANT_ROLE_SELECTOR);
  if (!assistants.length) return '';
  const last = assistants[assistants.length - 1];
  const contentEl = last.querySelector(ASSISTANT_CONTENT_SELECTOR);
  const text = (contentEl?.textContent || '').trim();
  if (text) console.log('[AgenticMem] Last assistant message:', text);
  return text;
}

// -----------------------------
// Memory Processing API
// -----------------------------
// NOTE: Django root urls.py maps the app under 'api/memories/', not 'memories/'.
// Previous constant caused 404 (POST /memories/process-memory/ 404). Adjusted to correct path.
const PROCESS_MEMORY_ENDPOINT = 'http://localhost:8000/api/memories/process-memory/'; // Adjust if backend served elsewhere

// -----------------------------
// ID Helpers (user + conversation)
// -----------------------------
async function fetchUserIdStrict() {
  return new Promise((resolve, reject) => {
    try {
      chrome.runtime.sendMessage({ type: 'GET_USER_ID' }, resp => {
        if (chrome.runtime.lastError) {
          return reject(new Error(chrome.runtime.lastError.message));
        }
        if (!resp?.ok) {
          return reject(new Error(resp?.error || 'User not authenticated'));
        }
        resolve(resp.userId);
      });
    } catch (e) { reject(e); }
  });
}

function extractConversationIdFromUrl() {
  try {
    const path = location.pathname.split('/').filter(Boolean);
    const cIndex = path.indexOf('c');
    if (cIndex !== -1 && path[cIndex + 1]) return path[cIndex + 1];
    if (path.length === 1 && path[0].length > 10) return path[0];
    return null;
  } catch (_) { return null; }
}

function getConversationId() {
  const raw = extractConversationIdFromUrl();
  if (!raw) throw new Error('Conversation ID unavailable');
  return raw;
}

async function sendProcessMemory(draft, lastAssistant) {
  // Build a single message string combining last assistant + current user draft
  const parts = [];
  if (lastAssistant) parts.push(`Assistant: ${lastAssistant}`);
  if (draft) parts.push(`User: ${draft}`);
  const message = parts.join('\n');
  if (!message) return; // nothing to send

  try {
    const userId = await fetchUserIdStrict();
    const conversationId = getConversationId();
    const payload = { message, userId, conversationId };
    console.log('[AgenticMem] Sending process-memory payload', payload);
    fetch(PROCESS_MEMORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => { console.log('[AgenticMem] process-memory result', data); })
      .catch(err => { console.warn('[AgenticMem] process-memory request failed', err); });
  } catch (e) {
    console.warn('[AgenticMem] Aborting sendProcessMemory:', e.message);
  }
}

// Rebind handlers referencing triggerProcessMemory (ensure async invocation)
function bindAll() {
  bindTextarea(getTextarea());
  bindSendButton(document.querySelector('#composer-submit-button'));
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAll, { once: true });
} else {
  bindAll();
}

// Observe DOM in case the composer is re-rendered; minimal & silent
try {
  new MutationObserver(() => bindAll())
    .observe(document.documentElement || document.body, { childList: true, subtree: true });
} catch (_) {}

// Listen for popup retrieve request
try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_CURRENT_MESSAGES') {
      // Ensure latest draft captured before clearing
      updateDraft();
      const draftPart = captureStoredDraft();
      const assistantPart = getLastAssistantMessage() || '';
      // latestMessages: concatenated draft (if any) + newline + assistant message (if any)
      let latestMessages = '';
      if (draftPart && assistantPart) {
        latestMessages = draftPart + '\n' + assistantPart;
      } else if (draftPart) {
        latestMessages = draftPart;
      } else if (assistantPart) {
        latestMessages = assistantPart;
      }
      sendResponse({ ok: true, latestMessages, type: msg?.type });
      return true; // indicate async (though we responded sync)
    } else if (msg?.type === 'APPEND_MEMORIES') {
      try {
        const textarea = getTextarea();
        if (!textarea) {
          sendResponse?.({ ok: false, error: 'No textarea' });
          return true;
        }
        const memories = Array.isArray(msg.memories) ? msg.memories : [];
        if (!memories.length) {
          sendResponse?.({ ok: false, error: 'No memories' });
          return true;
        }
        // Format memories as bullet list comment-like block
        const formattedLines = memories.slice(0, 10).map((mem, idx) => {
          const content = (mem.content || '').replace(/\s+/g, ' ').trim();
          return `- (${idx + 1}) ${content}`.trim();
        });
  const formatted = formattedLines.join('\n');
        // We will prepend exactly two blank lines before the header (handled below), so no leading newlines here
        const prefix = '[Retrieved Context Memories]\n' +
            'Use these ONLY as silent background context. Do NOT echo, summarize, or refer to them explicitly unless the user directly asks.\n' +
            'In your response, focus solely on the user\'s current request. If none are relevant, ignore them.\n\n';
        const suffix = '\n[End Context Memories]\n';
        // Append to existing draft (marker removed per latest requirement)
  const currentVal = (isRealTextarea(textarea) ? textarea.value : textarea.textContent) || '';
        // Ensure exactly two blank lines before injected context in textarea scenario
        let baseVal = currentVal;
        if (!/\n\n$/.test(baseVal)) {
          if (/\n$/.test(baseVal)) baseVal += '\n'; else baseVal += '\n\n';
        }
        const newVal = baseVal + prefix + formatted + suffix;
        if (isRealTextarea(textarea)) {
          textarea.value = newVal;
        } else {
          // For contentEditable: build paragraph-based HTML so each line shows and is preserved on send.
          // We'll append structured <p> nodes instead of relying on raw newlines.
          const existingHTML = textarea.innerHTML || '';
          const para = (t) => `<p>${escapeHtml(t)}</p>`;
          const blank = '<p></p>';
          const memoryParas = formattedLines.map(l => para(l));
          const blockHTML = [
            blank, blank, // ensure two blank lines before context
            para('[Retrieved Context Memories]'),
            para('Use these ONLY as silent background context. Do NOT echo, summarize, or refer to them explicitly unless the user directly asks.'),
            para("In your response, focus solely on the user's current request. If none are relevant, ignore them."),
            blank,
            ...memoryParas,
            para('[End Context Memories]')
          ].join('');
          textarea.innerHTML = existingHTML + blockHTML;
          // Set caret at end
          try {
            const sel = window.getSelection();
            if (sel) {
              const range = document.createRange();
              range.selectNodeContents(textarea);
              range.collapse(false);
              sel.removeAllRanges();
              sel.addRange(range);
            }
          } catch(_) {}
        }
        // Trigger input event so site frameworks react
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        sendResponse?.({ ok: true, appended: memories.length });
      } catch (e) {
        console.warn('[AgenticMem] Failed to update textarea with memories', e);
        sendResponse?.({ ok: false, error: String(e) });
      }
      return true;
    }
  });
} catch (e) {
  console.warn('[AgenticMem] Could not register message listener', e);
}
