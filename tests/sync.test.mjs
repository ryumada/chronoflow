/**
 * @file sync.test.mjs
 * @description Unit tests for Google Drive cloud sync storage helpers, OAuth token flow, and Drive API calls
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/sync.js, ../src/js/state.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv, mockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const {
    getClientId,
    setClientId,
    getSavedToken,
    saveToken,
    getSavedUser,
    saveUser,
    getCloudMeta,
    saveCloudMeta,
    requestToken,
    findCloudBackup,
    uploadBackup,
    downloadBackup,
    disconnect,
    signIn
} = await import('../src/js/sync.js');
const { state } = await import('../src/js/state.js');

const jsonResponse = (data, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data))
});

test.beforeEach(() => {
    resetMockEnv();
    setClientId('');
    disconnect();
    state.tasks = [];
    state.history = [];
    state.sprintStartDay = 0;
    state.timerRefreshRate = 60000;
});

test('localStorage helpers manage client ID, tokens, user profile, cloud meta, and corrupted JSON safely', () => {
    const defaultId = getClientId();
    assert.ok(defaultId.includes('.apps.googleusercontent.com'));

    saveToken({ accessToken: 'tok-1', expiresAt: Date.now() + 3600_000 });
    assert.equal(getSavedToken().accessToken, 'tok-1');

    // Setting custom client ID trims value and clears saved token
    setClientId('  custom-client-123  ');
    assert.equal(getClientId(), 'custom-client-123');
    assert.equal(getSavedToken(), null);

    // Clearing client ID falls back to default
    setClientId('   ');
    assert.equal(getClientId(), defaultId);

    // Invalid tokenData clears token
    saveToken({ accessToken: 'only-token' });
    assert.equal(getSavedToken(), null);

    // User & cloud meta roundtrip and clear
    saveUser({ name: 'Ada', email: 'ada@example.com' });
    assert.equal(getSavedUser().email, 'ada@example.com');
    saveUser(null);
    assert.equal(getSavedUser(), null);

    saveCloudMeta({ fileId: 'f1', sizeBytes: 128 });
    assert.equal(getCloudMeta().fileId, 'f1');
    saveCloudMeta(null);
    assert.equal(getCloudMeta(), null);

    // Corrupted JSON returns null without throwing
    localStorage.setItem('chrono_google_sync_token', '{bad');
    localStorage.setItem('chrono_google_sync_auth', '{bad');
    localStorage.setItem('chrono_google_sync_meta', '{bad');
    assert.equal(getSavedToken(), null);
    assert.equal(getSavedUser(), null);
    assert.equal(getCloudMeta(), null);
});

test('requestToken returns valid persisted token without invoking GIS and rejects if GIS is missing', async () => {
    const validToken = { accessToken: 'persisted-tok', expiresAt: Date.now() + 600_000 };
    saveToken(validToken);

    const tok = await requestToken();
    assert.equal(tok, 'persisted-tok');

    // Clear token and ensure missing window.google rejects cleanly
    disconnect();
    const origWarn = console.warn;
    console.warn = () => {};
    try {
        await assert.rejects(() => requestToken(), /Google Identity Services library is not loaded/);
    } finally {
        console.warn = origWarn;
    }
});

test('requestToken and signIn complete interactive GIS OAuth flow, pass email hint, and handle GIS errors', async () => {
    let capturedConfig = null;
    let lastRequestArgs = null;
    window.google = {
        accounts: {
            oauth2: {
                initTokenClient(cfg) {
                    capturedConfig = cfg;
                    return {
                        requestAccessToken(req) {
                            lastRequestArgs = req;
                        }
                    };
                },
                revoke() {}
            }
        }
    };

    saveUser({ email: 'saved@example.com', name: 'Saved' });
    mockEnv.fetchHandler = async (url) => {
        if (url.includes('userinfo')) {
            return jsonResponse({ name: 'Ada Lovelace', email: 'ada@example.com', picture: 'https://img/a.png' });
        }
        return jsonResponse({}, 404);
    };

    const tokenPromise = requestToken();
    assert.equal(lastRequestArgs.hint, 'saved@example.com');
    await capturedConfig.callback({ access_token: 'fresh-tok', expires_in: 3600 });
    const token = await tokenPromise;

    assert.equal(token, 'fresh-tok');
    assert.equal(getSavedToken().accessToken, 'fresh-tok');
    assert.equal(getSavedUser().email, 'ada@example.com');

    // signIn passes select_account prompt (no hint) and handles tokenResponse.error
    disconnect();
    const origErr = console.error;
    console.error = () => {};
    try {
        const errPromise = signIn();
        assert.equal(lastRequestArgs.prompt, 'select_account');
        assert.equal(lastRequestArgs.hint, undefined);
        await capturedConfig.callback({ error: 'access_denied', error_description: 'User cancelled' });
        await assert.rejects(() => errPromise, /User cancelled/);

        // error_callback rejection
        const gisErrPromise = requestToken();
        capturedConfig.error_callback(new Error('Popup blocked'));
        await assert.rejects(() => gisErrPromise, /Popup blocked/);
    } finally {
        console.error = origErr;
    }
});

test('findCloudBackup returns file or null, clears token on 401, and throws on 500', async () => {
    saveToken({ accessToken: 'tok-abc', expiresAt: Date.now() + 600_000 });

    mockEnv.fetchHandler = async () => jsonResponse({ files: [{ id: 'file-1', name: 'chronoflow-backup.json', size: '512' }] });
    const found = await findCloudBackup();
    assert.equal(found.id, 'file-1');
    assert.match(mockEnv.fetchCalls[0].url, /spaces=appDataFolder/);

    mockEnv.fetchHandler = async () => jsonResponse({ files: [] });
    assert.equal(await findCloudBackup('tok-abc'), null);

    mockEnv.fetchHandler = async () => jsonResponse('Unauthorized', 401);
    await assert.rejects(() => findCloudBackup('tok-abc'), /authorization expired or revoked/);
    assert.equal(getSavedToken(), null);

    mockEnv.fetchHandler = async () => jsonResponse('Server Error', 500);
    await assert.rejects(() => findCloudBackup('tok-abc'), /Google Drive API error \(500\)/);
});

test('uploadBackup creates multipart backup via POST when absent and updates via PATCH when present', async () => {
    saveToken({ accessToken: 'tok-up', expiresAt: Date.now() + 600_000 });
    state.tasks = [{ id: 't1', title: 'Cloud Task', timeLog: [] }];
    state.history = [];

    // Case 1: No existing file -> POST multipart
    mockEnv.fetchHandler = async (url, opts) => {
        if (url.includes('spaces=appDataFolder')) return jsonResponse({ files: [] });
        if (opts.method === 'POST') return jsonResponse({ id: 'created-file-id' });
        return jsonResponse({}, 500);
    };

    const meta1 = await uploadBackup();
    assert.equal(meta1.fileId, 'created-file-id');
    assert.ok(meta1.sizeBytes > 0);
    assert.equal(getCloudMeta().fileId, 'created-file-id');
    const postCall = mockEnv.fetchCalls.find(c => c.options.method === 'POST');
    assert.match(postCall.url, /uploadType=multipart/);
    assert.match(postCall.options.body, /Cloud Task/);

    // Case 2: Existing file -> PATCH media
    mockEnv.fetchCalls.length = 0;
    mockEnv.fetchHandler = async (url, opts) => {
        if (url.includes('spaces=appDataFolder')) return jsonResponse({ files: [{ id: 'existing-id' }] });
        if (opts.method === 'PATCH') return jsonResponse({ id: 'existing-id' });
        return jsonResponse({}, 500);
    };

    const meta2 = await uploadBackup();
    assert.equal(meta2.fileId, 'existing-id');
    const patchCall = mockEnv.fetchCalls.find(c => c.options.method === 'PATCH');
    assert.match(patchCall.url, /files\/existing-id\?uploadType=media/);

    // Case 3: PATCH fails with 500
    mockEnv.fetchHandler = async (url, opts) => {
        if (url.includes('spaces=appDataFolder')) return jsonResponse({ files: [{ id: 'existing-id' }] });
        if (opts.method === 'PATCH') return jsonResponse('Disk full', 500);
        return jsonResponse({}, 500);
    };
    await assert.rejects(() => uploadBackup(), /Failed to update cloud backup \(500\)/);
});

test('downloadBackup returns parsed payload, rejects missing backup or invalid schema, and handles HTTP errors', async () => {
    saveToken({ accessToken: 'tok-dl', expiresAt: Date.now() + 600_000 });

    // Missing backup
    mockEnv.fetchHandler = async () => jsonResponse({ files: [] });
    await assert.rejects(() => downloadBackup(), /No cloud backup found/);

    // Valid backup
    mockEnv.fetchHandler = async (url) => {
        if (url.includes('spaces=appDataFolder')) {
            return jsonResponse({ files: [{ id: 'f-9', modifiedTime: '2026-11-24T10:00:00Z', size: 256 }] });
        }
        return jsonResponse({ tasks: [{ id: 't1' }], history: [], sprintStartDay: 1 });
    };
    const { data, meta } = await downloadBackup();
    assert.equal(data.tasks.length, 1);
    assert.equal(meta.fileId, 'f-9');
    assert.equal(meta.sizeBytes, 256);
    assert.equal(getCloudMeta().fileId, 'f-9');

    // Invalid schema
    mockEnv.fetchHandler = async (url) => {
        if (url.includes('spaces=appDataFolder')) return jsonResponse({ files: [{ id: 'f-bad' }] });
        return jsonResponse({ foo: 'bar' });
    };
    await assert.rejects(() => downloadBackup(), /invalid or corrupted data schema/);

    // 401 during download invalidates token
    mockEnv.fetchHandler = async (url) => {
        if (url.includes('spaces=appDataFolder')) return jsonResponse({ files: [{ id: 'f-9' }] });
        return jsonResponse('Expired', 401);
    };
    await assert.rejects(() => downloadBackup(), /authorization expired or revoked/);
    assert.equal(getSavedToken(), null);
});

test('disconnect revokes active token when GIS is present and clears all saved session data', async () => {
    const revokedTokens = [];
    window.google = {
        accounts: {
            oauth2: {
                revoke(token, cb) {
                    revokedTokens.push(token);
                    if (cb) cb();
                }
            }
        }
    };

    saveToken({ accessToken: 'tok-live', expiresAt: Date.now() + 600_000 });
    saveUser({ name: 'Ada', email: 'ada@example.com' });
    saveCloudMeta({ fileId: 'f1' });

    // Load persisted token into module memory via requestToken
    await requestToken();
    disconnect();

    assert.deepEqual(revokedTokens, ['tok-live']);
    assert.equal(getSavedToken(), null);
    assert.equal(getSavedUser(), null);
    assert.equal(getCloudMeta(), null);
});
