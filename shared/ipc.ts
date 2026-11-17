import type {
  AddTracksToPlaylistInput,
  LibraryEvent,
  LibraryRevision,
  LibraryState,
  PlaylistAdditionResult,
  PlaylistCreationInput,
  PlaylistCreationResult,
  PlaylistRead,
  RemovePlaylistTracksInput,
  SetTracksLikedInput,
  TracksLikedResult,
} from "./library";
import type { LibrarySnapshotJson } from "./library-json";

export type SavedPlaybackSession = {
  payload: string;
  position: number;
};

export type LumeInvokeApi = {
  addSource: () => Promise<LibraryRevision>;
  addTracksToPlaylist: (input: AddTracksToPlaylistInput) => Promise<PlaylistAdditionResult>;
  createPlaylist: (input: PlaylistCreationInput) => Promise<PlaylistCreationResult>;
  deletePlaylist: (playlistId: number) => Promise<LibraryRevision>;
  disableSource: (sourceId: number) => Promise<LibraryRevision>;
  enableSource: (sourceId: number) => Promise<LibraryRevision>;
  forgetSource: (sourceId: number) => Promise<LibraryRevision>;
  hasTrackFile: (trackId: number) => Promise<boolean>;
  loadLibrary: () => Promise<LibrarySnapshotJson>;
  loadLibraryState: () => Promise<LibraryState>;
  loadPlaybackSession: () => Promise<SavedPlaybackSession | null>;
  loadPlaylist: (playlistId: number) => Promise<PlaylistRead>;
  openDataFolder: () => Promise<void>;
  removePlaylistTracks: (input: RemovePlaylistTracksInput) => Promise<LibraryRevision>;
  rescanSource: (sourceId: number) => Promise<LibraryRevision>;
  rescanSources: () => Promise<LibraryRevision>;
  savePlaybackPosition: (position: number) => Promise<void>;
  savePlaybackSession: (session: SavedPlaybackSession) => Promise<void>;
  setTracksLiked: (input: SetTracksLikedInput) => Promise<TracksLikedResult>;
};

type PlaybackSessionMethod = "loadPlaybackSession" | "savePlaybackPosition" | "savePlaybackSession";

export type LumeApi = Omit<LumeInvokeApi, PlaybackSessionMethod> & {
  playbackSession: {
    flush: (session: SavedPlaybackSession) => void;
    load: LumeInvokeApi["loadPlaybackSession"];
    save: LumeInvokeApi["savePlaybackSession"];
    savePosition: LumeInvokeApi["savePlaybackPosition"];
  };
  isMac: boolean;
  onLibraryEvent: (listener: (event: LibraryEvent) => void) => () => void;
};

// Electron includes the channel name in the error text the renderer shows for a failed call.
export const lumeChannels = {
  addSource: "lume:add-source",
  addTracksToPlaylist: "lume:add-tracks-to-playlist",
  createPlaylist: "lume:create-playlist",
  deletePlaylist: "lume:delete-playlist",
  disableSource: "lume:disable-source",
  enableSource: "lume:enable-source",
  forgetSource: "lume:forget-source",
  hasTrackFile: "lume:has-track-file",
  loadLibrary: "lume:load-library",
  loadLibraryState: "lume:load-library-state",
  loadPlaybackSession: "lume:load-playback-session",
  loadPlaylist: "lume:load-playlist",
  openDataFolder: "lume:open-data-folder",
  removePlaylistTracks: "lume:remove-playlist-tracks",
  rescanSource: "lume:rescan-source",
  rescanSources: "lume:rescan-sources",
  savePlaybackPosition: "lume:save-playback-position",
  savePlaybackSession: "lume:save-playback-session",
  setTracksLiked: "lume:set-tracks-liked",
} as const satisfies Record<keyof LumeInvokeApi, `lume:${string}`>;

export const lumeEventChannels = {
  flushPlaybackSession: "lume:flush-playback-session",
  libraryEvent: "lume:library-event",
} as const;
