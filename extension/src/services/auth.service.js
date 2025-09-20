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
        this.claims = null;
        this.primaryUserId = null; // derived from sub (preferred) or oid only after successful login
    }

    _generateNonce() {
        const array = new Uint8Array(16);
        window.crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }

    _decodeJwt(token) {
        if (!token) return null;
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        try {
            const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
            return payload;
        } catch (e) {
            console.warn('[AgenticMem][auth] Failed to decode id_token', e);
            return null;
        }
    }

    async init() {
        if (this._initialized) {
            return;
        }

            const auth = await chrome.storage.local.get(['accessToken', 'idToken', 'user', 'expiresAt', 'claims', 'primaryUserId']);
            if (auth.accessToken && auth.idToken && auth.user && auth.expiresAt && auth.primaryUserId) {
            if (Date.now() >= auth.expiresAt) {
                console.log('[AgenticMem][auth] Token expired, clearing auth data');
                await this.logout();
                return;
            }
            this.accessToken = auth.accessToken;
            this.idToken = auth.idToken;
            this.token = auth.idToken;
            this.user = auth.user;
            this.expiresAt = auth.expiresAt;
            this.claims = auth.claims || null;
            this.primaryUserId = auth.primaryUserId;
            console.log('[AgenticMem][auth] Restored auth state:', {
                accessToken: this.accessToken.substring(0, 10) + '...',
                idToken: this.idToken.substring(0, 10) + '...',
                userId: this.primaryUserId,
                expiresAt: new Date(this.expiresAt).toISOString()
            });
        }

        this._initialized = true;
    }

    async login() {
        try {
            const redirectUri = chrome.identity.getRedirectURL();
            console.log('[AgenticMem][auth] Redirect URI:', redirectUri);
            const state = this._generateNonce();

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

            const responseUrl = await chrome.identity.launchWebAuthFlow({
                url: authUrl,
                interactive: true
            });
            if (!responseUrl) throw new Error('No response from auth flow');

            console.log('[AgenticMem][auth] Response URL:', responseUrl.substring(0, 100) + '...');
            const fragment = new URL(responseUrl).hash.substring(1);
            const hashParams = new URLSearchParams(fragment);

            // Early error detection from AAD
            const err = hashParams.get('error');
            if (err) {
                const errDesc = decodeURIComponent(hashParams.get('error_description') || '').replace(/\+/g,' ');
                // Common mapping
                let friendly = errDesc || err;
                if (err === 'access_denied') {
                    friendly = 'Access was denied (user closed dialog or declined permissions).';
                } else if (/AADSTS65001/.test(errDesc)) {
                    friendly = 'The application needs admin consent for the requested permissions.';
                } else if (/AADSTS900144/.test(errDesc)) {
                    friendly = 'Invalid or mismatched redirect URI. Confirm it matches Azure AD app registration.';
                } else if (/AADSTS500113/.test(errDesc)) {
                    friendly = 'The reply URL/redirect URI is not registered for the application.';
                }
                throw new Error(`Azure AD error (${err}): ${friendly}`);
            }

            const accessToken = hashParams.get('access_token');
            const idToken = hashParams.get('id_token');
            const returnedState = hashParams.get('state');
            const expiresIn = hashParams.get('expires_in');

            if (returnedState !== state) throw new Error('State mismatch - possible security issue');
            if (!accessToken || !idToken) throw new Error('Missing required tokens');

            const expiresAt = Date.now() + (parseInt(expiresIn, 10) * 1000);
            const userInfo = await this.getUserInfo(accessToken);
            const claims = this._decodeJwt(idToken) || {};
            const sub = claims.sub;
            const oid = claims.oid;
            if (!sub && !oid) throw new Error('ID token missing both sub and oid claims; cannot establish user identity');
            this.primaryUserId = sub || oid;

            this.accessToken = accessToken;
            this.idToken = idToken;
            this.token = idToken;
            this.user = userInfo;
            this.expiresAt = expiresAt;
            this.claims = claims;

            await chrome.storage.local.set({
                accessToken: this.accessToken,
                idToken: this.idToken,
                token: this.idToken,
                user: this.user,
                expiresAt: this.expiresAt,
                claims: this.claims,
                primaryUserId: this.primaryUserId
            });
            console.log('[AgenticMem][auth] Login success userId=', this.primaryUserId);
            return true;
        } catch (error) {
            console.error('Login error:', error);
            throw error;
        }
    }

    async getUserInfo(accessToken) {
        const response = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (!response.ok) throw new Error('Failed to get user info');
        return response.json();
    }

    async logout() {
        try {
            await chrome.storage.local.remove(['token', 'accessToken', 'user', 'expiresAt', 'claims', 'primaryUserId']);
            this.token = null;
            this.accessToken = null;
            this.user = null;
            this.expiresAt = null;
            this.claims = null;
            this.primaryUserId = null;
            return true;
        } catch (error) {
            console.error('Logout error:', error);
            throw error;
        }
    }

    async makeAuthenticatedRequest(url, options = {}) {
        if (!this.idToken) throw new Error('Not authenticated');
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${this.idToken}`,
            'Content-Type': 'application/json'
        };
        const fullUrl = url.startsWith('http') ? url : `${AUTH_CONFIG.apiBaseUrl}${url}`;
        try {
            const response = await fetch(fullUrl, { ...options, headers });
            if (response.status === 401) {
                // Token refresh not implemented; force logout to avoid silent fallback.
                await this.logout();
                throw new Error('Unauthorized (401) - user logged out');
            }
            return response;
        } catch (error) {
            console.error('API request error:', error);
            throw error;
        }
    }

    isAuthenticated() {
        return !!(this.token && this.expiresAt && Date.now() < this.expiresAt && this.primaryUserId);
    }

    getUser() { return this.user; }
    getUserId() { return this.primaryUserId; }
    getClaims() { return this.claims; }
}

export const authService = new AuthService();