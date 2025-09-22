# Pensieve Chrome Extension (Boilerplate)

Minimal Manifest V3 boilerplate.

## Features
- MV3 service worker (`background.js`)
- Popup UI (`popup.html` + `popup.js`)
- Placeholder icons path

## Load in Chrome
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked**
4. Select this `Extension` folder

## Next Steps
- Replace placeholder icons in `icons/`
- Implement message handling in `background.js`
- Add needed permissions to `manifest.json`

## Messaging Example
Popup sends a `PING` message; you can implement a listener in `background.js` like:
```js
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'PING') {
    sendResponse({ type: 'PONG', ts: Date.now() });
  }
});
```
