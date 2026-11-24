/**
 * @file mockEnv.mjs
 * @description Shared zero-dependency browser, DOM, WebAudio, and API mock harness for Node tests
 * @requires None
 */

const camelCase = (str) => str.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

class MockClassList {
    constructor(element) {
        this._el = element;
        this._set = new Set();
    }
    _syncFromString(str) {
        this._set = new Set(String(str || '').split(/\s+/).filter(Boolean));
    }
    add(...classes) {
        classes.filter(Boolean).forEach(c => this._set.add(c));
    }
    remove(...classes) {
        classes.filter(Boolean).forEach(c => this._set.delete(c));
    }
    toggle(cls, force) {
        if (force === true) {
            this._set.add(cls);
            return true;
        }
        if (force === false) {
            this._set.delete(cls);
            return false;
        }
        if (this._set.has(cls)) {
            this._set.delete(cls);
            return false;
        }
        this._set.add(cls);
        return true;
    }
    contains(cls) {
        return this._set.has(cls);
    }
    toString() {
        return Array.from(this._set).join(' ');
    }
}

function matchesSimpleSelector(el, simple) {
    if (!el || !simple) return false;
    let remaining = simple.trim();
    if (!remaining) return false;

    // Extract attribute selectors: [attr="val"], [attr='val'], [attr]
    const attrRegex = /\[([^\]=]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\]]*)))?\]/g;
    let match;
    while ((match = attrRegex.exec(remaining)) !== null) {
        const attrName = match[1].trim();
        const expected = match[2] ?? match[3] ?? match[4];
        const actual = el.getAttribute(attrName);
        if (expected === undefined) {
            if (actual === null || actual === undefined) return false;
        } else if (String(actual) !== expected) {
            return false;
        }
    }
    remaining = remaining.replace(attrRegex, '');

    // Extract tag name at start (before any # or .)
    const tagMatch = remaining.match(/^([a-zA-Z0-9_-]+)/);
    if (tagMatch) {
        if (el.tagName !== tagMatch[1].toUpperCase()) return false;
        remaining = remaining.slice(tagMatch[0].length);
    }

    // Extract #id and .class tokens
    const tokenRegex = /([#.])([a-zA-Z0-9_-]+)/g;
    while ((match = tokenRegex.exec(remaining)) !== null) {
        const kind = match[1];
        const name = match[2];
        if (kind === '#') {
            if (el.id !== name) return false;
        } else if (kind === '.') {
            if (!el.classList.contains(name)) return false;
        }
    }
    return true;
}

function matchesSelectorPart(el, selector) {
    const parts = selector.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return false;
    if (!matchesSimpleSelector(el, parts[parts.length - 1])) return false;

    let current = el.parentElement;
    for (let i = parts.length - 2; i >= 0; i--) {
        let matched = false;
        while (current) {
            if (matchesSimpleSelector(current, parts[i])) {
                matched = true;
                current = current.parentElement;
                break;
            }
            current = current.parentElement;
        }
        if (!matched) return false;
    }
    return true;
}

function matchesSelector(el, selector) {
    return selector.split(',').some(part => matchesSelectorPart(el, part));
}

function parseSimpleTagHtml(html) {
    const tagMatch = String(html).trim().match(/^<([a-zA-Z0-9_-]+)([^>]*)>/);
    const el = new MockElement(tagMatch ? tagMatch[1] : 'div');
    if (tagMatch && tagMatch[2]) {
        const attrRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/g;
        let m;
        while ((m = attrRegex.exec(tagMatch[2])) !== null) {
            el.setAttribute(m[1], m[2]);
        }
    }
    el._innerHTML = html;
    return el;
}

export class MockElement {
    constructor(tagName = 'div', opts = {}) {
        this.tagName = String(tagName).toUpperCase();
        this.id = opts.id || '';
        this.classList = new MockClassList(this);
        this.dataset = { ...(opts.dataset || {}) };
        this.style = {};
        this.children = [];
        this.parentElement = null;
        this._attributes = {};
        this._listeners = {};
        this._text = opts.textContent || '';
        this._innerHTML = opts.innerHTML || '';
        this.value = opts.value ?? '';
        this.disabled = false;
        this.title = opts.title || '';
        this.href = '';
        this.download = '';
        this.src = '';
        this.onclick = null;
        this.onblur = null;
        this.onkeydown = null;
        this.focused = false;
        this.clicked = 0;
        this.selectionRange = null;

        if (opts.className) this.className = opts.className;
        if (opts.attributes) {
            for (const [k, v] of Object.entries(opts.attributes)) {
                this.setAttribute(k, v);
            }
        }
    }

    get className() {
        return this.classList.toString();
    }
    set className(val) {
        this.classList._syncFromString(val);
    }

    get textContent() {
        return this._text;
    }
    set textContent(val) {
        this._text = String(val ?? '');
    }

    get innerText() {
        return this._text;
    }
    set innerText(val) {
        this._text = String(val ?? '');
    }

    get innerHTML() {
        return this._innerHTML;
    }
    set innerHTML(val) {
        this._innerHTML = String(val ?? '');
        if (this._innerHTML === '') {
            this.children.forEach(c => { c.parentElement = null; });
            this.children = [];
        }
    }

    get outerHTML() {
        return this._innerHTML;
    }
    set outerHTML(html) {
        if (!this.parentElement) return;
        const idx = this.parentElement.children.indexOf(this);
        if (idx === -1) return;
        const replacement = parseSimpleTagHtml(html);
        replacement.parentElement = this.parentElement;
        this.parentElement.children.splice(idx, 1, replacement);
        this.parentElement = null;
    }

    get firstChild() {
        return this.children[0] || null;
    }

    setAttribute(name, value) {
        const strVal = String(value);
        this._attributes[name] = strVal;
        if (name === 'id') this.id = strVal;
        else if (name === 'class') this.className = strVal;
        else if (name === 'href') this.href = strVal;
        else if (name === 'download') this.download = strVal;
        else if (name === 'title') this.title = strVal;
        else if (name.startsWith('data-')) {
            this.dataset[camelCase(name.slice(5))] = strVal;
        }
    }

    getAttribute(name) {
        if (name === 'id') return this.id || null;
        if (name === 'class') return this.className || null;
        if (name === 'href') return this.href || this._attributes.href || null;
        if (name === 'download') return this.download || this._attributes.download || null;
        if (name === 'title') return this.title || this._attributes.title || null;
        if (name.startsWith('data-')) {
            const key = camelCase(name.slice(5));
            if (key in this.dataset) return String(this.dataset[key]);
        }
        return name in this._attributes ? this._attributes[name] : null;
    }

    hasAttribute(name) {
        return this.getAttribute(name) !== null;
    }

    appendChild(child) {
        if (child.parentElement) child.parentElement.removeChild(child);
        child.parentElement = this;
        this.children.push(child);
        return child;
    }

    insertBefore(newNode, refNode) {
        if (newNode.parentElement) newNode.parentElement.removeChild(newNode);
        newNode.parentElement = this;
        const idx = refNode ? this.children.indexOf(refNode) : -1;
        if (idx === -1) this.children.push(newNode);
        else this.children.splice(idx, 0, newNode);
        return newNode;
    }

    removeChild(child) {
        const idx = this.children.indexOf(child);
        if (idx !== -1) {
            this.children.splice(idx, 1);
            child.parentElement = null;
        }
        return child;
    }

    remove() {
        if (this.parentElement) this.parentElement.removeChild(this);
    }

    addEventListener(type, fn) {
        if (!this._listeners[type]) this._listeners[type] = [];
        this._listeners[type].push(fn);
    }

    dispatchEvent(event) {
        const ev = event || { type: '' };
        if (!ev.target) ev.target = this;
        if (!ev.preventDefault) ev.preventDefault = () => { ev.defaultPrevented = true; };
        if (!ev.stopPropagation) ev.stopPropagation = () => { ev.propagationStopped = true; };
        const list = this._listeners[ev.type] || [];
        list.forEach(fn => fn(ev));
        return ev;
    }

    focus() {
        this.focused = true;
    }

    blur() {
        this.focused = false;
        if (typeof this.onblur === 'function') this.onblur();
    }

    click() {
        this.clicked += 1;
        if (typeof this.onclick === 'function') this.onclick();
        this.dispatchEvent({ type: 'click', detail: 1, target: this });
    }

    setSelectionRange(start, end) {
        this.selectionRange = [start, end];
    }

    closest(selector) {
        let cur = this;
        while (cur) {
            if (matchesSelector(cur, selector)) return cur;
            cur = cur.parentElement;
        }
        return null;
    }

    querySelectorAll(selector) {
        const results = [];
        const walk = (node) => {
            for (const child of node.children) {
                if (matchesSelector(child, selector)) results.push(child);
                walk(child);
            }
        };
        walk(this);
        return results;
    }

    querySelector(selector) {
        return this.querySelectorAll(selector)[0] || null;
    }
}

export function createMockElement(tagName = 'div', opts = {}) {
    return new MockElement(tagName, opts);
}

class MockLocalStorage {
    constructor() {
        this._data = Object.create(null);
    }
    getItem(key) {
        return Object.prototype.hasOwnProperty.call(this._data, key) ? this._data[key] : null;
    }
    setItem(key, value) {
        this._data[key] = String(value);
    }
    removeItem(key) {
        delete this._data[key];
    }
    clear() {
        this._data = Object.create(null);
    }
}

const DEFAULT_ELEMENT_IDS = [
    'themeIconSun', 'themeIconMoon', 'themeToggle',
    'newTaskInput', 'newTaskPriority', 'addTaskBtn', 'taskCount', 'todoList',
    'activeTaskTitle', 'globalTimer', 'activeControls', 'globalActionBtn',
    'errorModal', 'errorMessage',
    'confirmModal', 'cancelDeleteBtn', 'confirmDeleteBtn',
    'manualTimeModal', 'manualTimeModalTitle', 'manualHoursInput', 'manualMinutesInput',
    'chunkTimeModal', 'chunkTimeModalTitle', 'chunkAvailableTime',
    'chunkTaskTitleInput', 'chunkTaskPriority', 'chunkHoursInput', 'chunkMinutesInput',
    'exportTasksBtn', 'copyTasksBtn',
    'journalModal', 'journalModalTitle', 'journalTitleInput', 'journalContentInput',
    'journalList', 'closeJournalBtn', 'addJournalBtn', 'addJournalAndCloseBtn', 'copyJournalBtn',
    'historyRangeLabel', 'historyList', 'analyticsChart', 'totalTimeStat', 'completedCountStat',
    'prevPeriodBtn', 'nextPeriodBtn', 'todayBtn', 'exportReportBtn', 'copyReportBtn',
    'cleanupBtn', 'cleanupModal', 'exportBtn', 'importBtn', 'importInput',
    'zenModeBtn', 'helpBtn', 'shortcutsModal',
    'settingsBtn', 'settingsModal', 'closeSettingsModal', 'closeSettingsBtn',
    'volumeSlider', 'volumeValue', 'sprintStartSelect', 'refreshRateSelect',
    'googleSyncDisconnected', 'googleSyncConnected', 'googleUserAvatar',
    'googleUserName', 'googleUserEmail', 'cloudLastSyncTime', 'cloudBackupSize',
    'btnGoogleSignin', 'btnGoogleSignout', 'btnCloudBackup', 'btnCloudRestore',
    'googleClientIdInput', 'btnSaveClientId',
    'cloudRestoreModal', 'closeCloudRestoreModal', 'cancelCloudRestoreBtn', 'confirmCloudRestoreBtn',
    'cloudRestoreModalTime', 'cloudRestoreModalSize',
    'cloudSyncSuccessModal', 'closeCloudSyncSuccessModal', 'closeCloudSyncSuccessOkBtn',
    'cloudSyncSuccessTitle', 'cloudSyncSuccessMessage',
    'cloudSyncSuccessDetail1Label', 'cloudSyncSuccessDetail1Value',
    'cloudSyncSuccessDetail2Label', 'cloudSyncSuccessDetail2Value'
];

export const mockEnv = {
    alerts: [],
    confirms: [],
    confirmResult: true,
    clipboardWrites: [],
    clipboardError: null,
    createdObjectURLs: [],
    revokedObjectURLs: [],
    audioContexts: [],
    fetchCalls: [],
    fetchHandler: null,
    _docListeners: {},
    _winListeners: {},
    _elementsById: new Map(),
    _root: null
};

function seedDefaultDOM() {
    const root = new MockElement('html');
    const body = new MockElement('body');
    root.appendChild(body);
    mockEnv._root = root;
    mockEnv._elementsById.clear();

    const hiddenModals = new Set([
        'errorModal', 'confirmModal', 'manualTimeModal', 'chunkTimeModal',
        'journalModal', 'cleanupModal', 'shortcutsModal', 'settingsModal',
        'cloudRestoreModal', 'cloudSyncSuccessModal', 'activeControls', 'googleSyncConnected'
    ]);

    for (const id of DEFAULT_ELEMENT_IDS) {
        const tag = id.endsWith('Input') ? 'input'
            : id.endsWith('Select') || id.endsWith('Priority') ? 'select'
            : id.endsWith('Btn') || id.startsWith('btn') ? 'button'
            : 'div';
        const el = new MockElement(tag, { id });
        if (hiddenModals.has(id)) el.classList.add('hidden');
        body.appendChild(el);
        mockEnv._elementsById.set(id, el);
    }

    // Confirm modal body paragraph
    const confirmModal = mockEnv._elementsById.get('confirmModal');
    const modalBody = new MockElement('div', { className: 'modal-body' });
    const modalP = new MockElement('p');
    modalBody.appendChild(modalP);
    confirmModal.appendChild(modalBody);

    // Default history view tabs
    ['day', 'week', 'month', 'year'].forEach((view, idx) => {
        const tab = new MockElement('button', {
            className: idx === 0 ? 'tab-btn active' : 'tab-btn',
            dataset: { view }
        });
        body.appendChild(tab);
    });

    // Logo element for SEGA easter egg
    const logo = new MockElement('div', { className: 'logo' });
    body.appendChild(logo);

    if (globalThis.document) {
        globalThis.document.body = body;
        globalThis.document.title = 'ChronoFlow';
    }
}

export function registerElement(el) {
    if (el.id) mockEnv._elementsById.set(el.id, el);
    if (!el.parentElement && globalThis.document?.body) {
        globalThis.document.body.appendChild(el);
    }
    return el;
}

class MockAudioContext {
    constructor() {
        this.state = 'running';
        this.currentTime = 0;
        this.destination = { kind: 'destination' };
        this.resumeCalls = 0;
        this.oscillators = [];
        this.gains = [];
        mockEnv.audioContexts.push(this);
    }
    resume() {
        this.resumeCalls += 1;
        this.state = 'running';
        return Promise.resolve();
    }
    createGain() {
        const gainNode = {
            connections: [],
            gain: {
                value: 1,
                setValueAtTimeCalls: [],
                linearRampCalls: [],
                exponentialRampCalls: [],
                setValueAtTime(v, t) {
                    this.value = v;
                    this.setValueAtTimeCalls.push({ value: v, time: t });
                },
                linearRampToValueAtTime(v, t) {
                    this.linearRampCalls.push({ value: v, time: t });
                },
                exponentialRampToValueAtTime(v, t) {
                    this.exponentialRampCalls.push({ value: v, time: t });
                }
            },
            connect(dest) {
                this.connections.push(dest);
            }
        };
        this.gains.push(gainNode);
        return gainNode;
    }
    createOscillator() {
        const osc = {
            type: 'sine',
            connections: [],
            startedAt: null,
            stoppedAt: null,
            detune: { value: 0 },
            frequency: {
                value: 440,
                ramps: [],
                linearRampToValueAtTime(v, t) {
                    this.ramps.push({ value: v, time: t });
                }
            },
            connect(dest) {
                this.connections.push(dest);
            },
            start(t) {
                this.startedAt = t;
            },
            stop(t) {
                this.stoppedAt = t;
            }
        };
        this.oscillators.push(osc);
        return osc;
    }
}

class MockFileReader {
    constructor() {
        this.onload = null;
    }
    readAsText(file) {
        const content = typeof file === 'string' ? file : (file?.content ?? '');
        if (typeof this.onload === 'function') {
            this.onload({ target: { result: content } });
        }
    }
}

export function installMockEnv() {
    globalThis.window = globalThis;
    globalThis.localStorage = new MockLocalStorage();
    globalThis.AudioContext = MockAudioContext;
    globalThis.webkitAudioContext = MockAudioContext;
    globalThis.FileReader = MockFileReader;

    globalThis.alert = (msg) => {
        mockEnv.alerts.push(String(msg));
    };
    globalThis.confirm = (msg) => {
        mockEnv.confirms.push(String(msg));
        return typeof mockEnv.confirmResult === 'function'
            ? mockEnv.confirmResult(msg)
            : Boolean(mockEnv.confirmResult);
    };

    Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        writable: true,
        value: {
            clipboard: {
                writeText(text) {
                    mockEnv.clipboardWrites.push(text);
                    if (mockEnv.clipboardError) {
                        return Promise.reject(mockEnv.clipboardError);
                    }
                    return Promise.resolve();
                }
            }
        }
    });

    globalThis.URL.createObjectURL = (blob) => {
        const url = `blob:mock-${mockEnv.createdObjectURLs.length + 1}`;
        mockEnv.createdObjectURLs.push({ url, blob });
        return url;
    };
    globalThis.URL.revokeObjectURL = (url) => {
        mockEnv.revokedObjectURLs.push(url);
    };

    globalThis.fetch = async (url, options = {}) => {
        mockEnv.fetchCalls.push({ url, options });
        if (typeof mockEnv.fetchHandler === 'function') {
            return mockEnv.fetchHandler(url, options);
        }
        throw new Error(`Unexpected fetch call to ${url}`);
    };

    globalThis.window.addEventListener = (type, fn) => {
        if (!mockEnv._winListeners[type]) mockEnv._winListeners[type] = [];
        mockEnv._winListeners[type].push(fn);
    };
    globalThis.window.dispatchEvent = (event) => {
        const ev = event || { type: '' };
        if (!ev.preventDefault) ev.preventDefault = () => { ev.defaultPrevented = true; };
        const list = mockEnv._winListeners[ev.type] || [];
        list.forEach(fn => fn(ev));
        return ev;
    };

    globalThis.document = {
        body: null,
        title: 'ChronoFlow',
        getElementById(id) {
            if (mockEnv._elementsById.has(id)) return mockEnv._elementsById.get(id);
            return mockEnv._root ? mockEnv._root.querySelector(`#${id}`) : null;
        },
        createElement(tag) {
            return new MockElement(tag);
        },
        querySelector(selector) {
            return mockEnv._root ? mockEnv._root.querySelector(selector) : null;
        },
        querySelectorAll(selector) {
            return mockEnv._root ? mockEnv._root.querySelectorAll(selector) : [];
        },
        addEventListener(type, fn) {
            if (!mockEnv._docListeners[type]) mockEnv._docListeners[type] = [];
            mockEnv._docListeners[type].push(fn);
        },
        dispatchEvent(event) {
            const ev = event || { type: '' };
            if (!ev.preventDefault) ev.preventDefault = () => { ev.defaultPrevented = true; };
            const list = mockEnv._docListeners[ev.type] || [];
            list.forEach(fn => fn(ev));
            return ev;
        }
    };

    seedDefaultDOM();
    return mockEnv;
}

export function resetMockEnv({ preserveElements = false } = {}) {
    if (globalThis.localStorage) globalThis.localStorage.clear();
    mockEnv.alerts.length = 0;
    mockEnv.confirms.length = 0;
    mockEnv.confirmResult = true;
    mockEnv.clipboardWrites.length = 0;
    mockEnv.clipboardError = null;
    mockEnv.createdObjectURLs.length = 0;
    mockEnv.revokedObjectURLs.length = 0;
    mockEnv.fetchCalls.length = 0;
    mockEnv.fetchHandler = null;
    delete globalThis.window.google;

    if (preserveElements) {
        globalThis.document.title = 'ChronoFlow';
        globalThis.document.body.className = '';
        for (const el of mockEnv._elementsById.values()) {
            el.value = '';
            el.textContent = '';
            el.innerHTML = '';
            el.disabled = false;
        }
    } else {
        seedDefaultDOM();
    }
}
