import type { ComponentProps } from "react";
import type { PlaybackContext } from "@/hooks/use-playback";

export type PlaybackValue = NonNullable<ComponentProps<typeof PlaybackContext.Provider>["value"]>;

const noop = () => {};

export const idlePlayback: PlaybackValue = {
  activeQueueItemId: null,
  activeSourceEntryId: null,
  activeSourcePlaylistId: null,
  activeTrack: null,
  applySourceChange: noop,
  canGoNext: false,
  duration: 0,
  enqueueTrack: noop,
  errorMessage: null,
  isInitialized: true,
  isMuted: false,
  isPlaying: false,
  jumpToQueueItem: noop,
  moveQueueItem: noop,
  next: noop,
  playSource: async () => {},
  playSourceEntry: async () => {},
  previous: noop,
  queue: null,
  removeQueueItem: noop,
  seek: noop,
  setShuffleEnabled: noop,
  setVolume: noop,
  shuffleEnabled: false,
  shufflePlay: async () => {},
  syncLibrary: noop,
  toggleMute: noop,
  togglePlayback: noop,
  volume: 1,
};
