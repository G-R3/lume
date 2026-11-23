import type { z } from "zod";
import type { PlaylistDuplicatesSchema, SetTracksLikedInputSchema } from "./schemas";

export type TrackMetadata = {
  album: string | null;
  albumArtists: string[];
  artists: string[];
  bitrate: number | null;
  bitsPerSample: number | null;
  channelCount: number | null;
  codec: string | null;
  discNumber: number | null;
  discTotal: number | null;
  duration: number | null;
  format: string;
  genres: string[];
  lossless: boolean | null;
  title: string;
  sampleRate: number | null;
  trackNumber: number | null;
  trackTotal: number | null;
  year: number | null;
};

export type TrackUnavailableReason =
  | "source-forgotten"
  | "source-off"
  | "source-missing"
  | "source-permission"
  | "source-unreadable"
  | "file-missing";

export type Track = TrackMetadata & {
  addedAt: number;
  artworkUrl: string | null;
  available: boolean;
  unavailableReason: TrackUnavailableReason | null;
  id: number;
  url: string;
  likedAt: number | null;
};

export type SetTracksLikedInput = z.infer<typeof SetTracksLikedInputSchema>;

export type TrackLikeResult = {
  likedAt: Track["likedAt"];
  trackId: Track["id"];
};

export type LibraryRevision = number;

export type TracksLikedResult = {
  likes: TrackLikeResult[];
  revision: LibraryRevision;
};

export type SourceStatus =
  | { kind: "off" }
  | { kind: "unscanned" }
  | { kind: "scanned"; scannedAt: number; trackCount: number }
  | {
      kind: "missing" | "permission" | "failed";
      lastScannedAt: number | null;
      errorMessage: string;
    };

export type LibrarySource = { id: number; path: string; status: SourceStatus };

export type ScanFrame = {
  afterRevision: LibraryRevision;
  scanning: readonly LibrarySource["id"][];
  sequence: number;
};

export type PlaylistEvent =
  | { kind: "playlist-created"; revision: LibraryRevision; playlist: PlaylistDetails }
  | { kind: "playlist-deleted"; revision: LibraryRevision; playlistId: number }
  | {
      kind: "playlist-tracks-added";
      revision: LibraryRevision;
      playlistId: number;
      tracks: PlaylistTrack[];
      trackCount: number;
    }
  | {
      kind: "playlist-tracks-removed";
      revision: LibraryRevision;
      playlistId: number;
      playlistTrackIds: number[];
      trackCount: number;
    };

export type LibraryEvent =
  | { kind: "changed"; revision: LibraryRevision }
  | { kind: "tracks-liked"; revision: LibraryRevision; likes: TrackLikeResult[] }
  | PlaylistEvent
  | { kind: "scans"; scans: ScanFrame };

export type LibraryState = { revision: LibraryRevision; scans: ScanFrame };

export type PlaylistSummary = {
  description: string | null;
  trackCount: number;
  id: number;
  title: string;
};

export type PlaylistCreationInput = {
  description: string | null;
  title: string;
  trackIds: readonly Track["id"][];
};

export type AddTracksToPlaylistInput = {
  duplicates: z.infer<typeof PlaylistDuplicatesSchema>;
  playlistId: number;
  trackIds: readonly Track["id"][];
};

export type RemovePlaylistTracksInput = {
  playlistId: number;
  playlistTrackIds: readonly number[];
};

export type PlaylistTrack = {
  /** When the track joined this playlist (playlist_entries.created_at, epoch ms). */
  addedAt: number;
  id: number;
  position: number;
  trackId: number;
};

export type PlaylistDetails = {
  description: string | null;
  tracks: PlaylistTrack[];
  id: number;
  title: string;
};

export type PlaylistRead = { revision: LibraryRevision; playlist: PlaylistDetails | null };

export type AddTracksToPlaylistResult =
  | { kind: "added"; tracks: PlaylistTrack[] }
  | { kind: "duplicate"; alreadyInPlaylist: number; newTrackCount: number };

export type MusicLibrary = {
  kind: "library";
  playlists: PlaylistSummary[];
  sources: LibrarySource[];
  tracks: Track[];
};

export type FirstRunLibrary = { kind: "first-run" };

/** A library read, with the scans main was running when it read. */
export type LibrarySnapshot = (MusicLibrary & LibraryState) | (FirstRunLibrary & LibraryState);

export type PlaylistCreationResult = {
  playlist: PlaylistDetails;
  revision: LibraryRevision;
};

export type PlaylistAdditionResult = AddTracksToPlaylistResult & { revision: LibraryRevision };
