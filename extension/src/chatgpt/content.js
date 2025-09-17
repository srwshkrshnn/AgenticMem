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

function bindTextarea(el) {
  if (!el || el.dataset.amBound) return;
  el.dataset.amBound = '1';
  el.addEventListener('input', updateDraft, true);
  el.addEventListener('keyup', updateDraft, true);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      // Update before capture in case last keystroke not flushed
      updateDraft();
      captureStoredDraft();
      getLastAssistantMessage();
    }
  }, true);
  updateDraft();
}

function bindSendButton(btn) {
  if (!btn || btn.dataset.amClick) return;
  btn.dataset.amClick = '1';
  btn.addEventListener('click', () => {
    updateDraft();
    captureStoredDraft();
    getLastAssistantMessage();
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
        const formatted = memories.slice(0, 10).map(mem => {
          const title = mem.title || 'Untitled';
          const content = mem.content || '';
          const sim = (typeof mem.similarity === 'number') ? ` (sim ${(mem.similarity).toFixed(3)})` : '';
          return `- ${title}: ${content}${sim}`.trim();
        }).join('\n');
        const prefix = '\n\n[Retrieved Memories]\n';
        // Append to existing draft (avoid duplicate if already present with same ts marker)
        const marker = msg.ts ? `<!--mem:${msg.ts}-->` : '';
        const currentVal = textarea.value || textarea.textContent || '';
        if (marker && currentVal.includes(marker)) {
          sendResponse?.({ ok: true, skipped: 'duplicate' });
          return true;
        }
        const newVal = currentVal + prefix + formatted + (marker ? `\n${marker}` : '');
        if ('value' in textarea) {
          textarea.value = newVal;
        } else {
          textarea.textContent = newVal;
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
