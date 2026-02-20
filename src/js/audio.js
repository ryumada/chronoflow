/**
 * @file audio.js
 * @description SoundManager class for handling audio feedback
 * @requires None
 */

export class SoundManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.enabled = true;
        this.masterVolume = parseFloat(localStorage.getItem('chrono_volume')) || 0.5; // Default 50%

        // Master Gain Node
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = this.masterVolume;
        this.masterGain.connect(this.ctx.destination);
    }

    setVolume(value) {
        let vol = Math.max(0, Math.min(1, value));
        this.masterVolume = vol;
        this.masterGain.gain.setValueAtTime(vol, this.ctx.currentTime);
        localStorage.setItem('chrono_volume', vol);
    }

    playTone(freq, type, duration, startTime = 0, volume = 0.1, endFreq = null) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.enabled) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.frequency.value = freq;
        if (endFreq) {
            osc.frequency.linearRampToValueAtTime(endFreq, this.ctx.currentTime + startTime + duration);
        }
        osc.type = type;

        osc.connect(gain);
        gain.connect(this.masterGain); // Route to Master Gain

        osc.start(this.ctx.currentTime + startTime);

        // Envelope
        gain.gain.setValueAtTime(0, this.ctx.currentTime + startTime);
        gain.gain.linearRampToValueAtTime(volume, this.ctx.currentTime + startTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + startTime + duration);

        osc.stop(this.ctx.currentTime + startTime + duration);
    }

    playStart() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Use Square wave (retro/game console startup sound) for maximum audibility
        this.playTone(440, 'square', 0.15, 0, 0.1);
        this.playTone(880, 'square', 0.4, 0.1, 0.1);
    }

    playStop() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(400, 'sawtooth', 0.2, 0, 0.1); // Sawtooth is loud
    }

    playComplete() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Triangle waves for chords are pleasant but audible
        this.playTone(523.25, 'triangle', 0.4, 0, 0.2);   // C5
        this.playTone(659.25, 'triangle', 0.4, 0.1, 0.2); // E5
        this.playTone(783.99, 'triangle', 0.6, 0.2, 0.2); // G5
        this.playTone(1046.50, 'triangle', 0.8, 0.3, 0.2);// C6
    }

    playClick() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Very short, high "tick" for general feedback
        this.playTone(600, 'sine', 0.05, 0, 0.05);
    }

    playCleanup() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(150, 'square', 0.4, 0, 0.1); // Square is very distinct
    }

    playWarning() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        // Two low square "alert" pulses
        this.playTone(220, 'square', 0.1, 0, 0.15); // A3
        this.playTone(165, 'square', 0.2, 0.12, 0.15); // E3 (roughly)
    }

    playError() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        this.playTone(150, 'sawtooth', 0.3, 0, 0.15, 100);
    }

    playSega() {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        if (!this.enabled) return;

        const now = this.ctx.currentTime;

        // 1. SE Sound (User specified)
        // 1. SE Sound (G4 Lead + Bass support)
        const playSE = (t) => {
            const freqs = [130.81, 196.00, 261.63, 392.00]; // C3, G3, C4, G4
            const duration = 0.8;

            freqs.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.frequency.value = f;
                osc.type = 'sawtooth';
                osc.detune.value = (i - 2) * 8; // Spread detune

                osc.connect(gain);
                gain.connect(this.masterGain); // Route to MASTER

                osc.start(t);

                gain.gain.setValueAtTime(0, t);
                // Bass notes get slightly more amplitude
                const noteVol = i < 2 ? 0.08 : 0.06; // Reduce gain
                gain.gain.linearRampToValueAtTime(noteVol, t + 0.1);
                gain.gain.setValueAtTime(noteVol, t + 0.4);
                gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

                osc.stop(t + duration);
            });
        };

        // 2. GA Sound (E3 Lead + Deep Bass support)
        const playGA = (t) => {
            const freqs = [65.41, 98.00, 130.81, 164.81]; // C2, G2, C3, E3
            const duration = 1.0;
            const vol = 0.08; // Reduced from 0.15 to prevent clipping

            freqs.forEach((f, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.frequency.value = f;
                osc.type = 'sawtooth';
                osc.detune.value = (i % 2 === 0 ? 1 : -1) * 8; // Alternating detune

                osc.connect(gain);
                gain.connect(this.masterGain); // Route to MASTER

                osc.start(t);

                gain.gain.setValueAtTime(0, t);
                gain.gain.linearRampToValueAtTime(vol, t + 0.05); // Fast attack
                gain.gain.setValueAtTime(vol, t + duration * 0.7);
                gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

                osc.stop(t + duration);
            });
        };

        // Sequence them
        playSE(now);
        playGA(now + 0.50); // Overlap slightly for seamless chant
    }

    toggle() {
        this.enabled = !this.enabled;
        return this.enabled;
    }
}

export const sounds = new SoundManager();
