import type { MusicLibrary, Track } from "../../../shared/lib";
import { componentStateTracks, roughDataTracks, toTrack } from "@/states/fixtures";

const sources = [...Object.values(componentStateTracks), ...roughDataTracks];

export function fixtureLibrary(count: number): MusicLibrary {
  const tracks: Track[] = Array.from({ length: count }, (_, index) => ({
    ...toTrack(sources[index % sources.length]!, index + 1),
    addedAt: Date.now() - index * 1000,
    available: true,
  }));

  return {
    kind: "library",
    playlists: [],
    sources: [
      {
        enabled: true,
        id: 1,
        lastScanError: null,
        lastScannedAt: Date.now(),
        path: "/Users/lume/Music",
        trackCount: count,
      },
    ],
    tracks,
  };
}
