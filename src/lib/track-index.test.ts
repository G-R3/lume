import { describe, expect, it } from "vite-plus/test";
import type { Track } from "@shared/library";
import { trackIndex } from "./track-index";

function track(id: number): Track {
  return {
    addedAt: id,
    album: null,
    albumArtists: [],
    artists: [],
    artworkUrl: null,
    available: true,
    unavailableReason: null,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "wav",
    genres: [],
    id,
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: `Track ${id}`,
    trackNumber: null,
    trackTotal: null,
    url: `lume://track/${id}`,
    year: null,
  };
}

describe("trackIndex", () => {
  it("finds each track by id", () => {
    const tracks = [track(3), track(7)];
    const index = trackIndex(tracks);

    expect(index.get(7)).toBe(tracks[1]);
    expect(index.get(3)).toBe(tracks[0]);
    expect(index.has(5)).toBe(false);
  });

  it("returns the same index for the same tracks array", () => {
    const tracks = [track(1)];

    expect(trackIndex(tracks)).toBe(trackIndex(tracks));
  });

  it("builds a new index for a new tracks array", () => {
    const first = [track(1)];
    const second = [track(1), track(2)];

    expect(trackIndex(first)).not.toBe(trackIndex(second));
    expect(trackIndex(second).get(2)).toBe(second[1]);
  });
});
