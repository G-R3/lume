// 23D: gain ramps around play, pause, seek and skip. A hard gain step mid-waveform is audible as a
// click; the tone makes it obvious, the track files make it real.

import { loopUrl } from "@/motion-lab/samples";

export const rampMs = { pause: 120, play: 60, seek: 15, skip: 80 };

export type SoundSource = "tone" | "loop" | "track";

export class LabSound {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private tone: OscillatorNode[] = [];
  private audio: HTMLAudioElement | null = null;
  private source: SoundSource = "tone";
  private trackUrl: string | null = null;
  private playing = false;

  ramps = true;
  speed = 1;

  async enable(source: SoundSource) {
    if (!this.context) {
      this.context = new AudioContext();
      this.gain = this.context.createGain();
      this.gain.gain.value = 0;
      this.gain.connect(this.context.destination);
    }

    await this.context.resume();
    this.setSource(source);
  }

  disable() {
    this.stopSource();
    void this.context?.close();
    this.context = null;
    this.gain = null;
  }

  setSource(source: SoundSource) {
    if (!this.context || !this.gain) return;

    this.stopSource();
    this.source = source;

    if (source === "tone") {
      // A soft A-major triad: pure sines click loudly on a hard cut
      this.tone = [220, 277.18, 329.63].map((frequency) => {
        const oscillator = this.context!.createOscillator();
        const level = this.context!.createGain();
        oscillator.frequency.value = frequency;
        level.gain.value = 0.12;
        oscillator.connect(level).connect(this.gain!);
        oscillator.start();

        return oscillator;
      });

      return;
    }

    this.audio = new Audio();
    this.context.createMediaElementSource(this.audio).connect(this.gain);
    this.load(0);
  }

  /** The file behind the current track. Fixtures have none, so they fall back to the loop. */
  setTrack(url: string | null) {
    this.trackUrl = url;
  }

  play() {
    this.playing = true;

    if (this.audio) void this.audio.play();
    this.rampTo(1, rampMs.play);
  }

  pause() {
    this.playing = false;
    const done = this.rampTo(0, rampMs.pause);

    window.setTimeout(() => !this.playing && this.audio?.pause(), done);
  }

  seek(seconds: number) {
    this.dip(rampMs.seek, rampMs.seek, () => {
      if (this.audio)
        this.audio.currentTime =
          this.source === "track" && this.trackUrl ? seconds : Math.random() * 20;
    });
  }

  skip(url: string | null) {
    this.trackUrl = url;
    this.dip(rampMs.skip, rampMs.play, () => this.load(0));
  }

  /** Down to silence, change something while nothing can be heard, then back up. */
  private dip(down: number, up: number, change: () => void) {
    if (!this.playing) {
      change();

      return;
    }

    window.setTimeout(
      () => {
        change();

        if (this.playing) {
          void this.audio?.play();
          this.rampTo(1, up);
        }
      },
      this.rampTo(0, down),
    );
  }

  private load(position: number) {
    if (!this.audio || this.source === "tone") return;

    const url = this.source === "track" && this.trackUrl ? this.trackUrl : loopUrl;
    const absolute = new URL(url, location.href).href;

    if (this.audio.src !== absolute) {
      this.audio.src = url;
      this.audio.loop = url === loopUrl;
    }

    this.audio.currentTime = position;

    if (this.playing) void this.audio.play();
  }

  /** Returns the ramp's length in milliseconds so callers can follow it. */
  private rampTo(value: number, ms: number) {
    if (!this.context || !this.gain) return 0;

    const now = this.context.currentTime;
    const length = this.ramps ? ms / this.speed : 0;
    this.gain.gain.cancelAndHoldAtTime(now);

    if (length === 0) this.gain.gain.setValueAtTime(value, now);
    else this.gain.gain.linearRampToValueAtTime(value, now + length / 1000);

    return length;
  }

  private stopSource() {
    this.tone.forEach((oscillator) => oscillator.stop());
    this.tone = [];
    this.audio?.pause();
    this.audio = null;
  }
}
