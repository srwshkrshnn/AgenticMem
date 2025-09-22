// background service worker for Pensieve
// Runs in MV3 service worker context
console.log('[Pensieve] background service worker loaded');

import { authService } from './src/services/auth.service.js';

chrome.runtime.onInstalled.addListener(details => {
  console.log('[Pensieve] onInstalled', details);
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'GET_USER_ID') {
    (async () => {
      try {
        await authService.init();
        if (!authService.isAuthenticated()) {
            sendResponse({ ok: false, error: 'Not authenticated' });
            return;
        }
        const userId = authService.getUserId();
        if (!userId) {
          sendResponse({ ok: false, error: 'User ID unavailable' });
          return;
        }
        sendResponse({ ok: true, userId });
      } catch (e) {
        sendResponse({ ok: false, error: String(e) });
      }
    })();
    return true; // async
  }
});
