console.log('[AgenticMem] Teams Content script loaded', new Date().toISOString());

// Configuration
const CONFIG = {
    apiBaseUrl: 'http://localhost:8000',
    minTextLength: 15,
    retrievalCooldown: 10000, // 10 seconds
    autoRetrievalInterval: 5000 // 5 seconds
};

// Teams selectors
const SELECTORS = {
    textInputs: [
        '[data-tid="ckeditor"]',
        '.ck-editor__editable',
        '[data-tid="message-compose-box"] [contenteditable="true"]',
        'div[contenteditable="true"][role="textbox"]',
        '[data-tid="meeting-chat-input"]'
    ],
    messageContainer: '[data-tid="conversation-pane"]',
    messageBubble: '[data-tid="chat-pane-message"]',
    messageContent: '.ui-chat__message__body'
};

// State
let lastMemoryRetrievalTime = 0;
let autoRetrievalTimer = null;
let lastKnownMessage = null;

// Auth helper
const auth = {
    async getStoredAuth() {
        try {
            const stored = await chrome.storage.local.get(['idToken', 'expiresAt']);
            if (stored.idToken && stored.expiresAt && Date.now() < stored.expiresAt) {
                return { token: stored.idToken, isAuthenticated: true };
            }
        } catch (error) {
            console.warn('[AgenticMem] Auth error:', error);
        }
        return { isAuthenticated: false };
    },

    async makeRequest(url, options = {}) {
        const authData = await this.getStoredAuth();
        if (!authData.isAuthenticated) {
            throw new Error('Not authenticated');
        }

        const fullUrl = url.startsWith('http') ? url : `${CONFIG.apiBaseUrl}${url}`;
        return fetch(fullUrl, {
            ...options,
            headers: {
                ...options.headers,
                'Authorization': `Bearer ${authData.token}`,
                'Content-Type': 'application/json'
            }
        });
    }
};

// DOM utilities
function getTextarea() {
    for (const selector of SELECTORS.textInputs) {
        const element = document.querySelector(selector);
        if (element) {
            console.log(`[AgenticMem] Found input: ${selector}`);
            return element;
        }
    }
    console.warn('[AgenticMem] No text input found');
    return null;
}

function setTextContent(element, content) {
    if (!element) return false;
    
    console.log('[AgenticMem] Setting content:', content.substring(0, 100) + '...');
    
    try {
        if (element.tagName === 'TEXTAREA') {
            element.innerHTML=content;
        } else if (element.contentEditable === 'true') {
            // Try multiple methods for contentEditable
            element.innerHTML =  `<p data-placeholder="Type a message">${content}</p>`;
            // Focus and set cursor at end
            element.focus();
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
        }
        
        return true;
    } catch (error) {
        console.error('[AgenticMem] Failed to set content:', error);
        return false;
    }
}

// Message retrieval
function getLastMessage() {
    console.log('[AgenticMem] Getting last message...');
    
    // Find message container
    let container = document.querySelector(SELECTORS.messageContainer);
    console.log('[AgenticMem] Primary container selector result:', !!container, SELECTORS.messageContainer);
    
    if (!container) {
        console.log('[AgenticMem] Primary container not found, trying alternatives...');
        // Try alternatives with detailed logging
        const alternatives = [
            '[data-tid="chat-pane-list"]',
            '[data-tid="virtualized-list"]',
            '[data-tid="chat-pane"]',
            '[data-tid="message-list"]',
            '[role="log"]',
            '[role="main"]',
            '.ui-chat__messagelist',
            '.ts-message-list',
            '.messages-container'
        ];
        
        for (const selector of alternatives) {
            container = document.querySelector(selector);
            console.log(`[AgenticMem] Trying ${selector}:`, !!container);
            if (container) {
                console.log('[AgenticMem] Found container with selector:', selector);
                console.log('[AgenticMem] Container element:', container);
                console.log('[AgenticMem] Container children count:', container.children.length);
                break;
            }
        }
        
        if (!container) {
            console.log('[AgenticMem] No message container found with any selector');
            // Let's try to find ANY element that might contain messages
            const anyMessageElements = document.querySelectorAll('[data-tid*="message"], [class*="message"], [role="listitem"]');
            console.log('[AgenticMem] Found elements with message-related attributes:', anyMessageElements.length);
            if (anyMessageElements.length > 0) {
                console.log('[AgenticMem] Sample message-related elements:', Array.from(anyMessageElements).slice(0, 3));
                // Try to find their common parent
                if (anyMessageElements.length > 0) {
                    container = anyMessageElements[0].parentElement;
                    console.log('[AgenticMem] Using parent of first message element as container:', container);
                }
            }
            
            if (!container) {
                return null;
            }
        }
    }
    
    // Find messages
    let messages = container.querySelectorAll(SELECTORS.messageBubble);
    console.log('[AgenticMem] Primary message selector result:', messages.length, SELECTORS.messageBubble);
    
    // Get last message content
    const lastMessage = messages[messages.length - 1];
    console.log('[AgenticMem] Processing last message element:', lastMessage);
    console.log('[AgenticMem] Last message innerHTML preview:', lastMessage.innerHTML?.substring(0, 200));
    
    let content = lastMessage.querySelector(SELECTORS.messageContent);
    console.log('[AgenticMem] Primary content selector result:', !!content, SELECTORS.messageContent);
    
    if (!content) {
        console.log('[AgenticMem] Primary content selector failed, trying alternatives...');
        // Try alternatives with detailed logging
        const contentSelectors = [
            '.message-body', 
            '[data-tid="message-body"]', 
            '.ui-chat__message__body',
            '.ts-message-body',
            '[data-tid="message-content"]',
            '.content',
            'p', 
            'div',
            'span'
        ];
        
        for (const selector of contentSelectors) {
            content = lastMessage.querySelector(selector);
            console.log(`[AgenticMem] Trying content selector ${selector}:`, !!content);
            if (content && content.textContent?.trim()) {
                console.log('[AgenticMem] Found content with selector:', selector);
                console.log('[AgenticMem] Content preview:', content.textContent.substring(0, 100));
                break;
            }
        }
    }
    
    const text = content ? (content.textContent || content.innerText || '') : lastMessage.textContent || '';
    console.log('[AgenticMem] Extracted text:', text.substring(0, 200));
    
    if (!text.trim()) {
        console.log('[AgenticMem] No text content found in last message');
        return null;
    }
    
    return {
        text: text.trim(),
        isFromCurrentUser: !!lastMessage.querySelector('[data-tid="message-from-me"]'),
        timestamp: Date.now()
    };
}

// Memory retrieval
async function retrieveMemories() {
    console.log('[AgenticMem] Retrieving memories...');
    
    const lastMessage = getLastMessage();
    
    // Use only the last message as context
    if (!lastMessage?.text) {
        showNotification('No last message for memory retrieval', 'warning');
        return;
    }
    
    const context = lastMessage.text;
    
    console.log('[AgenticMem] Context (last message only):', context.substring(0, 100) + '...');
    showNotification('Retrieving memories...', 'info');
    
    try {
        const authData = await auth.getStoredAuth();
        if (!authData.isAuthenticated) {
            showNotification('Please sign in first', 'error');
            return;
        }
        
        const params = new URLSearchParams({ q: context, top_k: '5' });
        const response = await auth.makeRequest(`/api/memories/retrieve-answer/?${params}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        
        const memories = await response.json();
        showNotification(`Retrieved answers`, 'success');
        injectMemories(memories);
        
    } catch (error) {
        console.error('[AgenticMem] Retrieval error:', error);
        showNotification(`Error: ${error.message}`, 'error');
    }
}

function injectMemories(memories) {
    // Format memories as a suggested reply
    const formatted = memories.answer

    const suggestion = `Based on our conversation history: ${formatted}`;

    // Create suggested reply button
    createSuggestedReply(suggestion, memories);
}

function createSuggestedReply(suggestionText, fullMemories) {
    // Remove any existing suggested replies
    const existingSuggestion = document.querySelector('#agenticmem-suggestion');
    if (existingSuggestion) {
        existingSuggestion.remove();
    }

    // Find the message compose area
    const composeArea = document.querySelector('[data-tid="message-compose-box"]') || 
                       document.querySelector('.ck-editor') ||
                       document.querySelector('[contenteditable="true"]');
    
    if (!composeArea) {
        console.warn('[AgenticMem] Could not find compose area for suggested reply');
        showNotification('Could not create suggested reply', 'warning');
        return;
    }

    // Create suggestion container
    const suggestionContainer = document.createElement('div');
    suggestionContainer.id = 'agenticmem-suggestion';
    suggestionContainer.style.cssText = `
        margin: 8px 0;
        padding: 12px;
        background: linear-gradient(135deg, #f0f8ff 0%, #e6f3ff 100%);
        border: 1px solid #0078d4;
        border-radius: 8px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
        box-shadow: 0 2px 8px rgba(0,120,212,0.1);
        position: relative;
        animation: slideIn 0.3s ease-out;
    `;

    // Add CSS animation
    if (!document.querySelector('#agenticmem-styles')) {
        const style = document.createElement('style');
        style.id = 'agenticmem-styles';
        style.textContent = `
            @keyframes slideIn {
                from { opacity: 0; transform: translateY(-10px); }
                to { opacity: 1; transform: translateY(0); }
            }
            .agenticmem-suggestion-text {
                color: #323130;
                line-height: 1.4;
                margin-bottom: 8px;
                padding-right: 24px;
            }
            .agenticmem-buttons {
                display: flex;
                gap: 8px;
                align-items: center;
            }
            .agenticmem-btn {
                padding: 6px 12px;
                border-radius: 4px;
                border: none;
                font-size: 12px;
                cursor: pointer;
                transition: all 0.2s ease;
                font-weight: 500;
            }
            .agenticmem-btn-primary {
                background: #0078d4;
                color: white;
            }
            .agenticmem-btn-primary:hover {
                background: #106ebe;
                transform: translateY(-1px);
            }
            .agenticmem-btn-secondary {
                background: #f3f2f1;
                color: #323130;
                border: 1px solid #d2d0ce;
            }
            .agenticmem-btn-secondary:hover {
                background: #edebe9;
            }
            .agenticmem-close {
                position: absolute;
                top: 8px;
                right: 8px;
                background: none;
                border: none;
                font-size: 16px;
                cursor: pointer;
                color: #605e5c;
                width: 20px;
                height: 20px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 2px;
            }
            .agenticmem-close:hover {
                background: #edebe9;
            }
        `;
        document.head.appendChild(style);
    }

    suggestionContainer.innerHTML = `
        <button class="agenticmem-close" title="Dismiss">×</button>
        <div class="agenticmem-suggestion-text">
            <strong>💡 AgenticMem Suggestion:</strong><br>
            ${suggestionText.length > 200 ? suggestionText.substring(0, 200) + '...' : suggestionText}
        </div>
        <div class="agenticmem-buttons">
            <button class="agenticmem-btn agenticmem-btn-primary" id="use-suggestion">
                Use This Reply
            </button>
            <button class="agenticmem-btn agenticmem-btn-secondary" id="view-details">
                View Details
            </button>
            <span style="color: #605e5c; font-size: 11px; margin-left: auto;">
                Based on ${fullMemories.sources.length} relevant memories
            </span>
        </div>
    `;

    // Insert before the compose area
    composeArea.parentNode.insertBefore(suggestionContainer, composeArea);

    // Add event listeners
    const useButton = suggestionContainer.querySelector('#use-suggestion');
    const detailsButton = suggestionContainer.querySelector('#view-details');
    const closeButton = suggestionContainer.querySelector('.agenticmem-close');

    useButton.addEventListener('click', () => {
        const textarea = getTextarea();
        if (textarea) {
            setTextContent(textarea, fullMemories.answer);
            showNotification('Contextual reply added', 'success');
        }
        suggestionContainer.remove();
    });

    detailsButton.addEventListener('click', () => {
        showMemoryDetails(fullMemories);
    });

    closeButton.addEventListener('click', () => {
        suggestionContainer.remove();
    });

    // Auto-dismiss after 15 seconds
    setTimeout(() => {
        if (suggestionContainer.parentNode) {
            suggestionContainer.style.opacity = '0.5';
            setTimeout(() => {
                if (suggestionContainer.parentNode) {
                    suggestionContainer.remove();
                }
            }, 2000);
        }
    }, 15000);
}

function generateContextualReply(memories) {
    // Create a natural response incorporating the memories
    const memoryPoints = memories.answer;
    
    return `I recall we discussed: ${memoryPoints.join('; ')}. Let me help you with this.`;
}

function showMemoryDetails(memories) {
    // Format memories for detailed view
    const formatted = memories.answer;

    // Create detailed popup (reuse existing popup code)
    const popup = document.createElement('div');
    popup.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 2px solid #0078d4;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,0.3);
        z-index: 20000;
        max-width: 600px;
        max-height: 80vh;
        overflow-y: auto;
        font-family: 'Segoe UI', sans-serif;
    `;

    popup.innerHTML = `
        <div style="padding: 20px;">
            <h3 style="margin: 0 0 15px 0; color: #0078d4; font-size: 18px;">
                Retrieved Context Memories
            </h3>
            <div style="
                background: #f5f5f5; 
                padding: 15px; 
                border-radius: 4px; 
                margin-bottom: 20px;
                white-space: pre-wrap;
                font-family: monospace;
                font-size: 14px;
                line-height: 1.4;
                max-height: 300px;
                overflow-y: auto;
                border: 1px solid #ddd;
            ">${formatted}</div>
            <div style="text-align: right;">
                <button id="closeDetails" style="
                    background: #0078d4;
                    color: white;
                    border: none;
                    padding: 8px 16px;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 14px;
                ">Close</button>
            </div>
        </div>
    `;

    // Create backdrop
    const backdrop = document.createElement('div');
    backdrop.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 19999;
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(popup);

    const closeButton = popup.querySelector('#closeDetails');
    const closePopup = () => {
        backdrop.remove();
        popup.remove();
    };

    closeButton.addEventListener('click', closePopup);
    backdrop.addEventListener('click', closePopup);

    // Close on Escape key
    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            closePopup();
            document.removeEventListener('keydown', handleKeydown);
        }
    };
    document.addEventListener('keydown', handleKeydown);
}

// Notifications
function showNotification(message, type = 'info') {
    const colors = {
        info: '#0078d4',
        success: '#107c10',
        warning: '#f7630c',
        error: '#d13438'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: ${colors[type]};
        color: white;
        padding: 12px 20px;
        border-radius: 4px;
        font-family: 'Segoe UI', sans-serif;
        font-size: 14px;
        z-index: 10000;
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
        max-width: 300px;
    `;
    notification.textContent = `[AgenticMem] ${message}`;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.opacity = '0';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
    
    return notification;
}

// Event handlers
function startAutoRetrieval() {
    console.log('[AgenticMem] Starting message change monitoring');
    
    // Clear any existing timer
    if (autoRetrievalTimer) {
        clearInterval(autoRetrievalTimer);
    }
    
    // Check for message changes every 2 seconds (but only retrieve if message changed)
    autoRetrievalTimer = setInterval(async () => {
        try {
            const currentMessage = getLastMessage();
            
            // Check if we have a new message
            if (lastKnownMessage != currentMessage?.text && !currentMessage?.isFromCurrentUser) {
                console.log('[AgenticMem] Message changed, retrieving memories');
                await retrieveMemories();
                lastKnownMessage = currentMessage?.text; // Update known message
            }
        } catch (error) {
            console.error('[AgenticMem] Error in auto-retrieval:', error);
            showNotification(`Auto-retrieval error: ${error.message}`, 'error');
        }
    }, 2000); // Check every 2 seconds
}

function stopAutoRetrieval() {
    console.log('[AgenticMem] Stopping message change monitoring');
    if (autoRetrievalTimer) {
        clearInterval(autoRetrievalTimer);
        autoRetrievalTimer = null;
    }
    lastKnownMessage = null; // Reset the known message
}

function bindEvents(element) {
    if (!element || element.dataset.amBound) return;
    element.dataset.amBound = '1';
    
    // Keyboard shortcuts
    element.addEventListener('keydown', async (e) => {
        if ((e.key === 'm' || e.key === 'r') && (e.ctrlKey || e.metaKey)) {
            // Manual retrieval: Ctrl+M or Ctrl+R
            e.preventDefault();
            try {
                await retrieveMemories();
            } catch (error) {
                console.error('[AgenticMem] Manual retrieval error:', error);
                showNotification(`Manual retrieval error: ${error.message}`, 'error');
            }
        }
    }, true);
}

function bindAll() {
    const textarea = getTextarea();
    if (textarea) bindEvents(textarea);
}

// Initialize
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        bindAll();
        startAutoRetrieval();
    }, { once: true });
} else {
    bindAll();
    startAutoRetrieval();
}

// Watch for DOM changes
try {
    new MutationObserver(bindAll).observe(document.body, { childList: true, subtree: true });
} catch (e) {
    console.warn('[AgenticMem] MutationObserver failed:', e);
}

// Handle extension messages
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'PING') {
        sendResponse({ ok: true, timestamp: Date.now() });
    } else if (msg?.type === 'RETRIEVE_MEMORIES_FOR_CONTEXT') {
        retrieveMemories()
            .then(() => sendResponse({ ok: true }))
            .catch(err => {
                console.error('[AgenticMem] Message handler error:', err);
                sendResponse({ ok: false, error: err.message });
            });
        return true; // Indicates we will respond asynchronously
    }
});

// Reset state on URL change
let currentUrl = window.location.href;
setInterval(() => {
    if (window.location.href !== currentUrl) {
        currentUrl = window.location.href;
        lastMemoryRetrievalTime = 0;
        lastKnownMessage = null; // Reset known message on URL change
        
        // Restart message monitoring on URL change
        stopAutoRetrieval();
        startAutoRetrieval();
        
        console.log('[AgenticMem] URL changed, state reset and message monitoring restarted');
    }
}, 1000);