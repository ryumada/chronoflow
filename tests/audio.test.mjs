/**
 * @file audio.test.mjs
 * @description Unit tests for SoundManager audio synthesis and volume controls
 * @requires node:test, node:assert/strict, ./helpers/mockEnv.mjs, ../src/js/audio.js
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { installMockEnv, resetMockEnv } from './helpers/mockEnv.mjs';

installMockEnv();

const { SoundManager, sounds } = await import('../src/js/audio.js');

test.beforeEach(() => {
    resetMockEnv();
});

test('SoundManager initializes default volume of 0.5 and loads persisted volume', () => {
    const defaultMgr = new SoundManager();
    assert.equal(defaultMgr.enabled, true);
    assert.equal(defaultMgr.masterVolume, 0.5);
    assert.equal(defaultMgr.masterGain.gain.value, 0.5);
    assert.deepEqual(defaultMgr.masterGain.connections, [defaultMgr.ctx.destination]);

    localStorage.setItem('chrono_volume', '0.8');
    const customMgr = new SoundManager();
    assert.equal(customMgr.masterVolume, 0.8);
    assert.equal(customMgr.masterGain.gain.value, 0.8);
    assert.ok(sounds instanceof SoundManager);
});

test('setVolume clamps values to [0, 1], updates masterGain, and persists to localStorage', () => {
    const mgr = new SoundManager();

    mgr.setVolume(-0.5);
    assert.equal(mgr.masterVolume, 0);
    assert.equal(localStorage.getItem('chrono_volume'), '0');

    mgr.setVolume(1.8);
    assert.equal(mgr.masterVolume, 1);
    assert.equal(localStorage.getItem('chrono_volume'), '1');

    mgr.setVolume(0.75);
    assert.equal(mgr.masterVolume, 0.75);
    assert.equal(localStorage.getItem('chrono_volume'), '0.75');
    assert.equal(mgr.masterGain.gain.setValueAtTimeCalls.at(-1).value, 0.75);
});

test('toggle flips enabled state and returns the new value', () => {
    const mgr = new SoundManager();
    assert.equal(mgr.toggle(), false);
    assert.equal(mgr.enabled, false);
    assert.equal(mgr.toggle(), true);
    assert.equal(mgr.enabled, true);
});

test('playTone resumes suspended AudioContext, respects enabled flag, and wires oscillator/envelope', () => {
    const mgr = new SoundManager();
    mgr.ctx.state = 'suspended';
    mgr.ctx.currentTime = 2;

    mgr.playTone(440, 'square', 0.25, 0.1, 0.2, 880);
    assert.equal(mgr.ctx.resumeCalls, 1);
    assert.equal(mgr.ctx.oscillators.length, 1);

    const osc = mgr.ctx.oscillators[0];
    assert.equal(osc.frequency.value, 440);
    assert.equal(osc.type, 'square');
    assert.equal(osc.startedAt, 2.1);
    assert.equal(osc.stoppedAt, 2.35);
    assert.equal(osc.frequency.ramps.length, 1);
    assert.equal(osc.frequency.ramps[0].value, 880);

    // Disabled should not create new oscillators
    mgr.toggle();
    mgr.playTone(440, 'sine', 0.1);
    assert.equal(mgr.ctx.oscillators.length, 1);
});

test('sound preset methods generate the expected oscillator counts and waveforms', () => {
    const cases = [
        ['playStart', 2, 'square'],
        ['playStop', 1, 'sawtooth'],
        ['playComplete', 4, 'triangle'],
        ['playSuccess', 4, 'triangle'],
        ['playClick', 1, 'sine'],
        ['playCleanup', 1, 'square'],
        ['playWarning', 2, 'square'],
        ['playError', 1, 'sawtooth'],
        ['playSega', 8, 'sawtooth']
    ];

    for (const [method, expectedCount, expectedType] of cases) {
        const mgr = new SoundManager();
        mgr.ctx.state = 'suspended';
        mgr[method]();
        assert.equal(mgr.ctx.oscillators.length, expectedCount, `${method} oscillator count`);
        assert.equal(mgr.ctx.oscillators[0].type, expectedType, `${method} waveform`);
        assert.ok(mgr.ctx.resumeCalls >= 1, `${method} resumes suspended context`);
    }

    // playError uses frequency ramp to 100Hz
    const errMgr = new SoundManager();
    errMgr.playError();
    assert.equal(errMgr.ctx.oscillators[0].frequency.ramps[0].value, 100);

    // playSega produces no oscillators when disabled
    const mutedMgr = new SoundManager();
    mutedMgr.toggle();
    mutedMgr.playSega();
    assert.equal(mutedMgr.ctx.oscillators.length, 0);
});
