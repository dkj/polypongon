export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.value = 0.3; // Low volume
        this.masterGain.connect(this.ctx.destination);

        this.isPlaying = false;
        this.nextNoteTime = 0;
        this.tempo = 120; // BPM

        // Scale for procedural music (Pentatonic)
        this.scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

        this.modes = {
            OFF: 'off',
            INTERACTIONS: 'interactions',
            ALL: 'all'
        };
        this.mode = this.modes.ALL;
    }

    async init() {
        if (this.isPlaying) return;

        if (this.ctx.state === 'suspended') {
            await this.ctx.resume();
        }

        if (this.isPlaying) return; // check again after await

        this.isPlaying = true;
        console.log('Audio initialized and scheduler started');
        this.nextNoteTime = this.ctx.currentTime;
        this.scheduler();
    }

    playBounce() {
        if (this.ctx.state === 'suspended' || this.mode === this.modes.OFF) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = 'sine';
        // Random pitch
        osc.frequency.value = 400 + Math.random() * 200;

        gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

        osc.start();
        osc.stop(this.ctx.currentTime + 0.1);
    }

    scheduler() {
        if (!this.isPlaying) return;

        while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
            this.playNote(this.nextNoteTime);
            // 8th notes
            const secondsPerBeat = 60.0 / this.tempo;
            this.nextNoteTime += 0.5 * secondsPerBeat;
        }

        setTimeout(() => this.scheduler(), 25);
    }

    playNote(time) {
        if (this.mode !== this.modes.ALL) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.connect(gain);
        gain.connect(this.masterGain);

        osc.type = 'triangle';
        // Pick random note from scale
        const freq = this.scale[Math.floor(Math.random() * this.scale.length)];
        osc.frequency.value = freq;

        gain.gain.setValueAtTime(0.1, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.2);

        osc.start(time);
        osc.stop(time + 0.2);
    }

    setDifficulty(diff) {
        // Increase tempo with difficulty
        // Base 120
        this.tempo = 120 + (diff - 1) * 60;
    }

    setMode(mode) {
        if (Object.values(this.modes).includes(mode)) {
            this.mode = mode;
        }
    }

    toggleMode() {
        if (this.mode === this.modes.ALL) {
            this.mode = this.modes.INTERACTIONS;
        } else if (this.mode === this.modes.INTERACTIONS) {
            this.mode = this.modes.OFF;
        } else {
            this.mode = this.modes.ALL;
        }
        return this.mode;
    }
}
