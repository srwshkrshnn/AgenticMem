// Constants
const AUTH_CONFIG = {
    clientId: '04437958-7157-44e1-9c0f-d8a56f6a3b1d',
    authority: 'https://login.microsoftonline.com/common/oauth2/v2.0',
    scope: 'openid profile email User.Read',
    responseType: 'id_token token',
    apiBaseUrl: 'http://localhost:8000'
};

class AuthService {
    constructor() {
        this.token = null;
        this.user = null;
        this.expiresAt = null;
        this._initialized = false;
    }

    _generateNonce() {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    async init() {
        if (this._initialized) {
            return;
        }

        // Try to get auth data from storage
        const auth = await chrome.storage.local.get(['accessToken', 'idToken', 'user', 'expiresAt']);
        
        if (auth.accessToken && auth.idToken && auth.user && auth.expiresAt) {
            // Check if token is expired
            if (Date.now() >= auth.expiresAt) {
                console.log('[AgenticMem][auth] Token expired, clearing auth data');
                await this.logout();
                return;
            }

            this.accessToken = auth.accessToken;
            this.idToken = auth.idToken;
            this.token = auth.idToken;  // For compatibility
            this.user = auth.user;
            this.expiresAt = auth.expiresAt;
            
            console.log('[AgenticMem][auth] Restored auth state:', {
                accessToken: this.accessToken.substring(0, 10) + '...',
                idToken: this.idToken.substring(0, 10) + '...',
                expiresAt: new Date(this.expiresAt).toISOString()
            });
        }

        this._initialized = true;
    }

    async login() {
        try {
            // Get the redirect URL from Chrome
            const redirectUri = chrome.identity.getRedirectURL();
            console.log('[AgenticMem][auth] Redirect URI:', redirectUri);

            // Generate state parameter for security
            const state = this._generateNonce();
            
            // Build the Microsoft login URL
            const authParams = new URLSearchParams({
                client_id: AUTH_CONFIG.clientId,
                response_type: AUTH_CONFIG.responseType,
                redirect_uri: redirectUri,
                scope: AUTH_CONFIG.scope,
                state: state,
                nonce: this._generateNonce(),
                response_mode: 'fragment'
            });

            const authUrl = `${AUTH_CONFIG.authority}/authorize?${authParams.toString()}`;
            console.log('[AgenticMem][auth] Auth URL:', authUrl);

            // Launch the web auth flow
            const responseUrl = await chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            });

            if (!responseUrl) {
                throw new Error('No response from auth flow');
            }

            // Parse the response URL
            console.log('[AgenticMem][auth] Response URL:', responseUrl.substring(0, 100) + '...');
            
            const hashParams = new URLSearchParams(new URL(responseUrl).hash.substring(1));
            const accessToken = hashParams.get('access_token');
            const idToken = hashParams.get('id_token');
            const returnedState = hashParams.get('state');
            const expiresIn = hashParams.get('expires_in');

            // Validate state parameter
            if (returnedState !== state) {
                throw new Error('State mismatch - possible security issue');
            }

            if (!accessToken || !idToken) {
                console.error('[AgenticMem][auth] Tokens received:', {
                    hasAccessToken: !!accessToken,
                    hasIdToken: !!idToken
                });
                throw new Error('Missing required tokens');
            }

            console.log('[AgenticMem][auth] Got tokens:', {
                accessToken: accessToken.substring(0, 10) + '...',
                idToken: idToken.substring(0, 10) + '...'
            });

            // Calculate token expiration time
            const expiresAt = Date.now() + (parseInt(expiresIn, 10) * 1000);

            // Get user info using the access token
            const userInfo = await this.getUserInfo(accessToken);
            
            // Store authentication data
            this.accessToken = accessToken;  // For Microsoft Graph API
            this.idToken = idToken;         // For our backend API
            this.token = idToken;           // For compatibility with existing code
            this.user = userInfo;
            this.expiresAt = expiresAt;

            // Save to chrome storage
            await chrome.storage.local.set({
                accessToken: this.accessToken,
                idToken: this.idToken,
                token: this.idToken,  // For compatibility
                user: this.user,
                expiresAt: this.expiresAt
            });

            return true;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async getUserInfo(accessToken) {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });

        if (!response.ok) {
            throw new Error('Failed to get user info');
        }

        return response.json();
    }

    async logout() {
        try {
            // Clear storage
            await chrome.storage.local.remove(['token', 'accessToken', 'user', 'expiresAt']);
            
            // Clear memory
            this.token = null;
            this.accessToken = null;
            this.user = null;
            this.expiresAt = null;

            return true;
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        if (!this.idToken) {
            throw new Error('Not authenticated');
        }

        // Add authentication header with ID token for our backend
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.idToken}`,
            'Content-Type': 'application/json'
        };

        // Add base URL if the URL is relative
        const fullUrl = url.startsWith('http') ? url : `${AUTH_CONFIG.apiBaseUrl}${url}`;

        try {
            const response = await fetch(fullUrl, {
                ...options,
                headers
            });

            // If unauthorized, try to refresh token
            if (response.status === 401) {
                await this.refreshToken();
                
                // Retry the request with new token
                headers.Authorization = `Bearer ${this.token}`;
                return fetch(fullUrl, {
                    ...options,
                    headers
                });
            }

            return response;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    isAuthenticated() {
        return !!(this.token && this.expiresAt && Date.now() < this.expiresAt);
    }

    getUser() {
        return this.user;
    }
}

export const authService = new AuthService();