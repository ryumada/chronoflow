/**
 * @file theme.test.mjs
 * @description Unit tests for light/dark theme persistence and icon toggling
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/theme.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const { loadTheme, toggleTheme } = await import('../src/js/theme.js');

test.beforeEach(() => {
    resetMockEnv();
    document.getElementById('themeIconSun').classList.add('hidden');
    document.getElementById('themeIconMoon').classList.remove('hidden');
});

test('loadTheme applies light mode and swaps icons when chrono_theme is light', () => {
    localStorage.setItem('chrono_theme', 'light');
    loadTheme();

    assert.equal(document.body.classList.contains('light-mode'), true);
    assert.equal(document.getElementById('themeIconSun').classList.contains('hidden'), false);
    assert.equal(document.getElementById('themeIconMoon').classList.contains('hidden'), true);
});

test('loadTheme keeps dark mode when chrono_theme is dark or unset', () => {
    loadTheme();
    assert.equal(document.body.classList.contains('light-mode'), false);
    assert.equal(document.getElementById('themeIconSun').classList.contains('hidden'), true);
    assert.equal(document.getElementById('themeIconMoon').classList.contains('hidden'), false);

    localStorage.setItem('chrono_theme', 'dark');
    loadTheme();
    assert.equal(document.body.classList.contains('light-mode'), false);
});

test('toggleTheme toggles between dark and light mode and updates localStorage and icons', () => {
    // Dark -> Light
    toggleTheme();
    assert.equal(document.body.classList.contains('light-mode'), true);
    assert.equal(localStorage.getItem('chrono_theme'), 'light');
    assert.equal(document.getElementById('themeIconSun').classList.contains('hidden'), false);
    assert.equal(document.getElementById('themeIconMoon').classList.contains('hidden'), true);

    // Light -> Dark
    toggleTheme();
    assert.equal(document.body.classList.contains('light-mode'), false);
    assert.equal(localStorage.getItem('chrono_theme'), 'dark');
    assert.equal(document.getElementById('themeIconSun').classList.contains('hidden'), true);
    assert.equal(document.getElementById('themeIconMoon').classList.contains('hidden'), false);
});
