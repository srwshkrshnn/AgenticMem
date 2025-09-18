console.log('[AgenticMem] Content script loaded', new Date().toISOString());

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
function triggerProcessMemory() {
  updateDraft();
  const draft = captureStoredDraft();
  const lastAssistant = getLastAssistantMessage();
  sendProcessMemory(draft, lastAssistant);
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

function sendProcessMemory(draft, lastAssistant) {
  try {
    // Build a single message string combining last assistant + current user draft
    const parts = [];
    if (lastAssistant) parts.push(`Assistant: ${lastAssistant}`);
    if (draft) parts.push(`User: ${draft}`);
    const message = parts.join('\n');
    if (!message) return; // nothing to send

    fetch(PROCESS_MEMORY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message // per requirement: do NOT send previous_summary for now
        // previous_summary intentionally omitted
      })
    })
      .then(r => r.json().catch(() => ({})))
      .then(data => {
        console.log('[AgenticMem] process-memory result', data);
      })
      .catch(err => {
        console.warn('[AgenticMem] process-memory request failed', err);
      });
  } catch (e) {
    console.warn('[AgenticMem] Failed to invoke process-memory', e);
  }
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
        const currentVal = textarea.value || textarea.textContent || '';
        // Ensure exactly two blank lines before injected context in textarea scenario
        let baseVal = currentVal;
        if (!/\n\n$/.test(baseVal)) {
          if (/\n$/.test(baseVal)) baseVal += '\n'; else baseVal += '\n\n';
        }
        const newVal = baseVal + prefix + formatted + suffix;
        if (isRealTextarea(textarea)) {
          textarea.value = newVal;
        } else {
          // For contentEditable, build HTML with <br>. Prepend two blank lines (two <br>). 
          const htmlBlock = [
            '', // first blank line
            '', // second blank line
            '[Retrieved Context Memories]',
            'Use these ONLY as silent background context. Do NOT echo, summarize, or refer to them explicitly unless the user directly asks.',
            "In your response, focus solely on the user's current request. If none are relevant, ignore them.",
            '', // blank line before list
            ...formattedLines,
            '[End Context Memories]'
          ].map(l => escapeHtml(l)).join('<br>');
          textarea.innerHTML = escapeHtml(currentVal) + htmlBlock;
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
