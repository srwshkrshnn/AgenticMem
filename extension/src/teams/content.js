// Teams content script for AgenticMem
// Purpose: Provide similar interface as ChatGPT content script so popup can request
// latest composed (draft) user message + last assistant (other participant or Copilot) message
// and append retrieved memories into the compose box.
//
// IMPORTANT: Microsoft Teams web UI is highly dynamic and class names often obfuscated
// or change. We rely on attribute/role-based selectors and text area heuristics.
// This is an initial best-effort implementation.
//
// Strategy:
// 1. Detect compose editable element (contenteditable div inside footer / composer region)
// 2. Track user draft (on input / keyup / keydown Enter send) similar to ChatGPT approach.
// 3. Extract last two messages from the thread:
//    - We treat elements with role="listitem" inside the message list region role="list".
//    - Each listitem may contain message bubble(s). We extract textual content ignoring buttons.
// 4. Provide message to popup via GET_CURRENT_MESSAGES.
// 5. APPEND_MEMORIES: inject a bullet list below current draft separated by heading.
//
// Future hardening ideas (TODO not implemented now):
// - Observe Teams internal store for canonical message objects (would require reverse engineering).
// - Filter out system messages ("You changed the channel picture", etc.).
// - Distinguish between other participants and Copilot (AI) if required.
//
// NOTE: This file intentionally mirrors function names of chatgpt/content.js for reuse.

console.log('[AgenticMem][Teams] Content script loaded', new Date().toISOString());

// --- Heuristic selectors ---
// region containing messages: role=list under main chat area
const MESSAGE_LIST_SELECTOR = 'div[role="list"]';
// list item for a single message (or message group)
const MESSAGE_ITEM_SELECTOR = 'div[role="listitem"]';
// Compose area notes:
// Observed element example (Sept 2025):
// <div id="new-message-<uuid>" placeholder="Type a message" data-tid="ckeditor" ... role="textbox" contenteditable="true" aria-label="Type a message" class="... ck ck-content ...">
// CKEditor root holds <p> children. We prioritize:
// 1. div[data-tid="ckeditor"][contenteditable="true"]
// 2. div[id^="new-message-"][contenteditable="true"]
// 3. fallback: div[contenteditable="true"][aria-label*="message" i]
const PRIMARY_COMPOSE_SELECTOR = 'div[data-tid="ckeditor"][contenteditable="true"]';
const ALT_COMPOSE_SELECTOR = 'div[id^="new-message-"][contenteditable="true"]';
const FALLBACK_COMPOSE_SELECTOR = 'div[contenteditable="true"][aria-label*="message" i]';

let currentDraft = '';

function findComposeEditable() {
  // Strict priority order
  const p = document.querySelector(PRIMARY_COMPOSE_SELECTOR);
  if (p) return p;
  const a = document.querySelector(ALT_COMPOSE_SELECTOR);
  if (a) return a;
  const f = document.querySelector(FALLBACK_COMPOSE_SELECTOR);
  if (f) return f;
  return null;
}

function getDraftValue(el) {
  if (!el) return '';
  // CKEditor uses <p data-placeholder> nodes. Extract text from non-empty paragraphs.
  // innerText is fine but we want to skip placeholder-only content.
  const paragraphs = Array.from(el.querySelectorAll('p'));
  if (paragraphs.length) {
    const parts = [];
    for (const p of paragraphs) {
      const txt = (p.innerText || '').trim();
      if (!txt) continue; // skip empty/placeholder
      // Some placeholders repeat the aria-label string; ignore if equals placeholder attribute
      const placeholder = p.getAttribute('data-placeholder');
      if (placeholder && placeholder.trim() === txt) continue;
      parts.push(txt);
    }
    if (parts.length) return parts.join('\n').trim();
  }
  return (el.innerText || '').trim();
}

function updateDraft() {
  const el = findComposeEditable();
  if (!el) return;
  const draft = getDraftValue(el);
  if (draft) currentDraft = draft; // only store non-empty
}

function captureStoredDraft() {
  if (!currentDraft) return '';
  const captured = currentDraft;
  console.log('[AgenticMem][Teams] Captured draft:', captured);
  currentDraft = '';
  return captured;
}

function bindCompose(el) {
  if (!el || el.dataset.amBound) return;
  el.dataset.amBound = '1';
  const handler = () => updateDraft();
  el.addEventListener('input', handler, true);
  el.addEventListener('keyup', handler, true);
  el.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      updateDraft();
      captureStoredDraft();
      getLastMessages();
    }
  }, true);
  updateDraft();
}

function bindAll() {
  bindCompose(findComposeEditable());
  // Also bind potential send button (paper plane) by aria-label
  const sendBtn = document.querySelector('button[aria-label*="send" i],button[data-tid="newMessageSendButton"]');
  if (sendBtn && !sendBtn.dataset.amClick) {
    sendBtn.dataset.amClick = '1';
    sendBtn.addEventListener('click', () => {
      updateDraft();
      captureStoredDraft();
      getLastMessages();
    }, true);
  }
}

function extractMessageTextFromItem(item) {
  if (!item) return '';
  // Remove reactions bar, buttons etc by cloning and stripping interactive regions
  const clone = item.cloneNode(true);
  // Remove buttons and menus
  clone.querySelectorAll('button, menu, svg, img').forEach(n => n.remove());
  // Extract visible text
  const text = (clone.innerText || '').trim();
  return text.replace(/\s+/g, ' ').trim();
}

function getLastMessages(limit = 2) {
  const list = document.querySelector(MESSAGE_LIST_SELECTOR);
  if (!list) return [];
  const items = Array.from(list.querySelectorAll(MESSAGE_ITEM_SELECTOR));
  if (!items.length) return [];
  // Take last N non-empty distinct texts
  const results = [];
  for (let i = items.length - 1; i >= 0 && results.length < limit; i--) {
    const txt = extractMessageTextFromItem(items[i]);
    if (txt && !results.includes(txt)) results.push(txt);
  }
  return results.reverse();
}

function getLatestAggregatedMessages() {
  const draftPart = captureStoredDraft();
  const recent = getLastMessages(2); // last 2 messages (could be other + you or vice versa)
  const combinedParts = [];
  if (draftPart) combinedParts.push(draftPart);
  if (recent.length) combinedParts.push(recent.join('\n'));
  const finalText = combinedParts.join('\n').trim();
  if (finalText) console.log('[AgenticMem][Teams] Latest aggregated messages:', finalText);
  return finalText;
}

function appendMemories(memories, ts) {
  const el = findComposeEditable();
  if (!el) return { ok: false, error: 'No compose editable' };
  if (!Array.isArray(memories) || !memories.length) return { ok: false, error: 'No memories' };
  const existing = getDraftValue(el);
  const marker = ts ? `<!--mem:${ts}-->` : '';
  if (marker && existing.includes(marker)) return { ok: true, skipped: 'duplicate' };
  const formatted = memories.slice(0, 10).map(mem => {
    const title = mem.title || 'Untitled';
    const content = mem.content || '';
    const sim = (typeof mem.similarity === 'number') ? ` (sim ${(mem.similarity).toFixed(3)})` : '';
    return `- ${title}: ${content}${sim}`.trim();
  }).join('\n');
  const prefix = '\n\n[Retrieved Memories]\n';
  const newVal = (existing ? existing + prefix : prefix) + formatted + (marker ? `\n${marker}` : '');
  // For contenteditable, set innerText/innerHTML carefully. We'll append as plain text to avoid markup injection.
  // Using document.createTextNode ensures frameworks still detect mutation.
  // Simpler: set innerText.
  el.innerText = newVal;
  // Dispatch input event
  el.dispatchEvent(new Event('input', { bubbles: true }));
  updateDraft();
  return { ok: true, appended: memories.length };
}

// Mutation observer to dynamically re-bind if Teams re-renders DOM
try {
  new MutationObserver(() => bindAll())
    .observe(document.documentElement || document.body, { childList: true, subtree: true });
} catch (e) {
  console.warn('[AgenticMem][Teams] MutationObserver failed', e);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindAll, { once: true });
} else {
  bindAll();
}

// Message listener to integrate with popup
try {
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.type === 'GET_CURRENT_MESSAGES') {
      updateDraft(); // capture latest keystrokes
      const latestMessages = getLatestAggregatedMessages();
      sendResponse({ ok: true, latestMessages, type: msg.type });
      return true;
    } else if (msg?.type === 'APPEND_MEMORIES') {
      const result = appendMemories(msg.memories, msg.ts);
      sendResponse(result);
      return true;
    }
  });
} catch (e) {
  console.warn('[AgenticMem][Teams] Could not register message listener', e);
}
