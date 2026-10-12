import { useMotionValue } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Track } from "../../shared/lib";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";
import type { LabSound } from "@/motion-lab/sound";

export type Input = "pointer" | "keyboard" | "auto";

/** One track change. `direction` follows the queue: 1 = next, -1 = previous, 0 = picked from a list. */
/** `from` is how far through the previous track playback was, 0 to 1, for the amber drain. */
export type Change = { id: number; direction: 1 | -1 | 0; input: Input; at: number; from: number };

const format = (track: Track, sampleRate: number, bitsPerSample: number): Track => ({
  ...track,
  format: "FLAC",
  sampleRate,
  bitsPerSample,
});

export const fixtureTracks: Track[] = [
  format(toTrack(componentStateTracks.playing, 1), 44100, 16),
  format(toTrack(componentStateTracks.focus, 2), 96000, 24),
  format(toTrack(componentStateTracks.default, 3), 44100, 16),
  format({ ...toTrack(componentStateTracks.selected, 4), duration: 10 * 60 + 4 }, 48000, 24),
  format(toTrack(componentStateTracks.hover, 5), 44100, 16),
  format({ ...toTrack(roughDataTracks[1]!, 6), duration: 4457 }, 192000, 24),
  format(toTrack(componentStateTracks.unavailable, 7), 44100, 16),
];

/** Fixtures and local samples, alternating, so every test passes through both. */
export function mixTracks(samples: Track[]) {
  const mixed: Track[] = [];

  for (let index = 0; index < Math.max(fixtureTracks.length, samples.length); index++) {
    if (samples[index]) mixed.push(samples[index]!);

    if (fixtureTracks[index]) mixed.push(fixtureTracks[index]!);
  }

  return mixed;
}

/** The last kind of input anywhere on the page, read when an action starts. */
export function useInputModality() {
  const modality = useRef<Input>("pointer");

  useEffect(() => {
    const onPointer = () => (modality.current = "pointer");
    const onKey = () => (modality.current = "keyboard");
    document.addEventListener("pointerdown", onPointer, true);
    document.addEventListener("keydown", onKey, true);

    return () => {
      document.removeEventListener("pointerdown", onPointer, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, []);

  return modality;
}

export function useLabPlayback(sound: LabSound, labTracks: Track[]) {
  const [index, setIndex] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);

  const [change, setChange] = useState<Change>({
    id: 0,
    direction: 0,
    input: "auto",
    at: 0,
    from: 0,
  });

  const time = useMotionValue(0);
  const state = useRef({ index, playing, labTracks });
  state.current = { index, playing, labTracks };

  const goTo = useCallback(
    (next: number | null, direction: Change["direction"], input: Input) => {
      const tracks = state.current.labTracks;
      const previous = state.current.index;
      const from = previous === null ? 0 : time.get() / (tracks[previous]!.duration ?? 1);

      if (next === null) {
        sound.pause();
        setPlaying(false);
      } else sound.skip(tracks[next]!.url || null);

      setIndex(next);
      time.set(0);
      setChange((current) => ({
        id: current.id + 1,
        direction,
        input,
        at: performance.now(),
        from,
      }));
    },
    [sound, time],
  );

  useEffect(() => {
    if (!playing || index === null) return;

    let last = performance.now();

    let frame = requestAnimationFrame(function tick(now) {
      const duration = labTracks[index]!.duration ?? 0;
      const next = time.get() + (now - last) / 1000;
      last = now;

      if (next >= duration) {
        goTo(index + 1 < labTracks.length ? index + 1 : null, 1, "auto");

        return;
      }

      time.set(next);
      frame = requestAnimationFrame(tick);
    });

    return () => cancelAnimationFrame(frame);
  }, [goTo, index, labTracks, playing, time]);

  return {
    index,
    track: index === null ? null : labTracks[index]!,
    playing,
    change,
    time,
    playIndex: (next: number, input: Input) => {
      goTo(next, 0, input);
      setPlaying(true);
      sound.play();
    },
    toggle: (input: Input) => {
      if (state.current.index === null) {
        goTo(0, 0, input);
        setPlaying(true);
        sound.play();

        return;
      }

      if (state.current.playing) sound.pause();
      else sound.play();
      setPlaying(!state.current.playing);
    },
    next: (input: Input) => {
      const current = state.current.index;

      if (current !== null) goTo(current + 1 < labTracks.length ? current + 1 : null, 1, input);
    },
    previous: (input: Input) => {
      const current = state.current.index;

      if (current !== null && current > 0) goTo(current - 1, -1, input);
    },
    seek: (seconds: number) => {
      sound.seek(seconds);
      time.set(seconds);
    },
    stop: () => goTo(null, 1, "auto"),
  };
}

export type LabPlayback = ReturnType<typeof useLabPlayback>;
