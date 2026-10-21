/**
 * @file sync.js
 * @description Google Drive cloud sync engine using Google Identity Services (GIS) and Drive AppData API
 * @requires GoogleIdentityServices, state, persistence
 */
import { state } from './state.js';

const DEFAULT_CLIENT_ID = '1092898676521-2eec766sc9i1lmtntbc77v3s7vnqk2ak.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/drive.appdata https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email';
const BACKUP_FILENAME = 'chronoflow-backup.json';
const STORAGE_KEY_AUTH = 'chrono_google_sync_auth';
const STORAGE_KEY_META = 'chrono_google_sync_meta';
const STORAGE_KEY_CLIENT_ID = 'chrono_google_client_id';
const STORAGE_KEY_TOKEN = 'chrono_google_sync_token';

let tokenClient = null;
let currentTokenResolve = null;
let currentTokenReject = null;

// Initialize active token and expiration from persisted storage if still valid
const initialTokenData = getSavedToken();
let activeAccessToken = (initialTokenData && Date.now() < (initialTokenData.expiresAt - 60000)) ? initialTokenData.accessToken : null;
let tokenExpiresAt = initialTokenData ? (initialTokenData.expiresAt || 0) : 0;

/**
 * Get active Google Client ID (custom or default)
 */
export function getClientId() {
    return localStorage.getItem(STORAGE_KEY_CLIENT_ID) || DEFAULT_CLIENT_ID;
}

/**
 * Set custom Google Client ID
 */
export function setClientId(customId) {
    if (customId && customId.trim()) {
        localStorage.setItem(STORAGE_KEY_CLIENT_ID, customId.trim());
    } else {
        localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
    }
    tokenClient = null;
    activeAccessToken = null;
    tokenExpiresAt = 0;
    saveToken(null);
}

/**
 * Retrieve saved OAuth token from localStorage
 */
export function getSavedToken() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_TOKEN);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Save OAuth token to localStorage
 */
export function saveToken(tokenData) {
    if (tokenData && tokenData.accessToken && tokenData.expiresAt) {
        localStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify(tokenData));
    } else {
        localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
}

/**
 * Retrieve saved user session from localStorage
 */
export function getSavedUser() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_AUTH);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Save user session to localStorage
 */
export function saveUser(user) {
    if (user) {
        localStorage.setItem(STORAGE_KEY_AUTH, JSON.stringify(user));
    } else {
        localStorage.removeItem(STORAGE_KEY_AUTH);
    }
}

/**
 * Retrieve cloud backup metadata (last sync date, file size)
 */
export function getCloudMeta() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY_META);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

/**
 * Save cloud backup metadata
 */
export function saveCloudMeta(meta) {
    if (meta) {
        localStorage.setItem(STORAGE_KEY_META, JSON.stringify(meta));
    } else {
        localStorage.removeItem(STORAGE_KEY_META);
    }
}

/**
 * Initialize Google Token Client via Google Identity Services
 */
function initClient() {
    if (typeof window.google === 'undefined' || !window.google.accounts || !window.google.accounts.oauth2) {
        console.warn('Google Identity Services library not yet loaded.');
        return false;
    }

    if (!tokenClient) {
        tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: getClientId(),
            scope: SCOPES,
            callback: async (tokenResponse) => {
                if (tokenResponse && tokenResponse.access_token) {
                    activeAccessToken = tokenResponse.access_token;
                    tokenExpiresAt = Date.now() + ((tokenResponse.expires_in || 3600) * 1000);

                    saveToken({
                        accessToken: activeAccessToken,
                        expiresAt: tokenExpiresAt
                    });

                    try {
                        const userInfo = await fetchUserProfile(activeAccessToken);
                        saveUser(userInfo);
                        if (currentTokenResolve) {
                            const resolve = currentTokenResolve;
                            currentTokenResolve = null;
                            currentTokenReject = null;
                            resolve(activeAccessToken);
                        }
                    } catch (err) {
                        console.error('Failed to fetch user profile:', err);
                        if (currentTokenReject) {
                            const reject = currentTokenReject;
                            currentTokenResolve = null;
                            currentTokenReject = null;
                            reject(err);
                        }
                    }
                } else if (tokenResponse && tokenResponse.error) {
                    console.error('Google Auth Error:', tokenResponse);
                    if (currentTokenReject) {
                        const reject = currentTokenReject;
                        currentTokenResolve = null;
                        currentTokenReject = null;
                        reject(new Error(tokenResponse.error_description || tokenResponse.error));
                    }
                }
            },
            error_callback: (err) => {
                console.error('GIS Error:', err);
                if (currentTokenReject) {
                    const reject = currentTokenReject;
                    currentTokenResolve = null;
                    currentTokenReject = null;
                    reject(err);
                }
            }
        });
    }

    return true;
}

/**
 * Request OAuth token, returning cached/persisted token if valid or requesting via GIS
 */
export function requestToken(promptMode = '') {
    return new Promise((resolve, reject) => {
        // Check persisted token if memory token is missing
        if (!activeAccessToken) {
            const saved = getSavedToken();
            if (saved && Date.now() < (saved.expiresAt - 60000)) {
                activeAccessToken = saved.accessToken;
                tokenExpiresAt = saved.expiresAt;
            }
        }

        if (activeAccessToken && Date.now() < tokenExpiresAt - 60000) {
            resolve(activeAccessToken);
            return;
        }

        if (!initClient()) {
            reject(new Error('Google Identity Services library is not loaded. Please check your internet connection.'));
            return;
        }

        currentTokenResolve = resolve;
        currentTokenReject = reject;

        const requestConfig = { prompt: promptMode };
        const savedUser = getSavedUser();
        if (savedUser && savedUser.email && !promptMode) {
            requestConfig.hint = savedUser.email;
        }

        tokenClient.requestAccessToken(requestConfig);
    });
}

/**
 * Handle HTTP 401 responses by invalidating saved token
 */
function handleAuthError(res) {
    if (res.status === 401) {
        activeAccessToken = null;
        tokenExpiresAt = 0;
        saveToken(null);
        throw new Error('Google authorization expired or revoked. Please sign in again.');
    }
}

/**
 * Fetch user profile (avatar, name, email) from Google OAuth UserInfo endpoint
 */
async function fetchUserProfile(token) {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
        handleAuthError(res);
        throw new Error('Could not fetch user profile from Google');
    }
    return await res.json();
}

/**
 * Search for existing backup file in the private AppData folder
 */
export async function findCloudBackup(token) {
    const activeToken = token || await requestToken();
    const query = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
    const url = `https://www.googleapis.com/drive/v3/files?spaces=appDataFolder&q=${query}&fields=files(id,name,modifiedTime,size)&pageSize=1`;

    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${activeToken}` }
    });

    if (!res.ok) {
        handleAuthError(res);
        const errText = await res.text();
        throw new Error(`Google Drive API error (${res.status}): ${errText}`);
    }

    const data = await res.json();
    return (data.files && data.files.length > 0) ? data.files[0] : null;
}

/**
 * Upload current ChronoFlow state to Google Drive AppData folder
 */
export async function uploadBackup() {
    const token = await requestToken();
    const payload = {
        version: 1,
        source: 'ChronoFlow',
        timestamp: new Date().toISOString(),
        tasks: state.tasks || [],
        history: state.history || [],
        sprintStartDay: state.sprintStartDay ?? 0,
        timerRefreshRate: state.timerRefreshRate ?? 60000
    };

    const jsonString = JSON.stringify(payload, null, 2);
    const existingFile = await findCloudBackup(token);

    let result;
    if (existingFile) {
        const uploadUrl = `https://www.googleapis.com/upload/drive/v3/files/${existingFile.id}?uploadType=media`;
        const res = await fetch(uploadUrl, {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: jsonString
        });

        if (!res.ok) {
            handleAuthError(res);
            const errText = await res.text();
            throw new Error(`Failed to update cloud backup (${res.status}): ${errText}`);
        }
        result = await res.json();
    } else {
        const metadata = {
            name: BACKUP_FILENAME,
            parents: ['appDataFolder'],
            mimeType: 'application/json'
        };

        const boundary = '-------314159265358979323846';
        const delimiter = `\r\n--${boundary}\r\n`;
        const closeDelim = `\r\n--${boundary}--`;

        const multipartBody =
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            JSON.stringify(metadata) +
            delimiter +
            'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
            jsonString +
            closeDelim;

        const uploadUrl = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': `multipart/related; boundary=${boundary}`
            },
            body: multipartBody
        });

        if (!res.ok) {
            handleAuthError(res);
            const errText = await res.text();
            throw new Error(`Failed to create cloud backup (${res.status}): ${errText}`);
        }
        result = await res.json();
    }

    const meta = {
        lastSyncTime: new Date().toISOString(),
        fileId: result.id || (existingFile && existingFile.id),
        sizeBytes: jsonString.length
    };
    saveCloudMeta(meta);
    return meta;
}

/**
 * Download and return backup JSON from Google Drive AppData folder
 */
export async function downloadBackup() {
    const token = await requestToken();
    const file = await findCloudBackup(token);

    if (!file) {
        throw new Error('No cloud backup found on this Google Drive account.');
    }

    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
    const res = await fetch(downloadUrl, {
        headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) {
        handleAuthError(res);
        const errText = await res.text();
        throw new Error(`Failed to download cloud backup (${res.status}): ${errText}`);
    }

    const parsed = await res.json();

    if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed.tasks) && !Array.isArray(parsed.history))) {
        throw new Error('Cloud backup file has invalid or corrupted data schema.');
    }

    const meta = {
        lastSyncTime: file.modifiedTime || new Date().toISOString(),
        fileId: file.id,
        sizeBytes: file.size || (JSON.stringify(parsed).length)
    };
    saveCloudMeta(meta);

    return { data: parsed, meta };
}

/**
 * Disconnect and clear user session
 */
export function disconnect() {
    if (activeAccessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
        try {
            window.google.accounts.oauth2.revoke(activeAccessToken, () => {});
        } catch (err) {
            console.warn('Token revocation skipped:', err);
        }
    }
    activeAccessToken = null;
    tokenExpiresAt = 0;
    saveToken(null);
    saveUser(null);
    saveCloudMeta(null);
}

export function signIn() {
    return requestToken('select_account');
}
