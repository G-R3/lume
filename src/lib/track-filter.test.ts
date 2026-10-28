import { describe, expect, it } from "vite-plus/test";
import type { Track } from "../../shared/lib";
import { matchesTrackFilter, parseTrackFilter } from "./track-filter";

function track(fields: Partial<Pick<Track, "title" | "artists" | "album">>): Track {
  return {
    addedAt: 0,
    album: null,
    albumArtists: [],
    artists: [],
    artworkUrl: null,
    available: true,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: 30,
    format: "wav",
    genres: [],
    id: 1,
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: "",
    trackNumber: null,
    trackTotal: null,
    url: "lume://track/1",
    year: null,
    ...fields,
  };
}

function matches(text: string, fields: Parameters<typeof track>[0]) {
  const filter = parseTrackFilter(text);

  if (!filter) throw new Error("Expected a filter");

  return matchesTrackFilter(track(fields), filter);
}

describe("parseTrackFilter", () => {
  it.each(["", "   ", "\t\n"])("returns null for blank text %j", (text) => {
    expect(parseTrackFilter(text)).toBeNull();
  });

  it("keeps the trimmed text and splits terms on any whitespace", () => {
    expect(parseTrackFilter("  Daft \t Disc  ")).toEqual({
      normalizedText: "daft disc",
      terms: ["daft", "disc"],
      text: "Daft \t Disc",
    });
  });

  it("gives texts that differ only in case, accents or spacing the same normalized text", () => {
    expect(parseTrackFilter("Beyoncé  Love")?.normalizedText).toBe(
      parseTrackFilter(" beyonce love")?.normalizedText,
    );
  });
});

describe("matchesTrackFilter", () => {
  it.each([
    { field: "title", fields: { title: "Digital Love" } },
    { field: "an artist", fields: { artists: ["Someone", "Digitalism"] } },
    { field: "album", fields: { album: "Digital Shades" } },
  ])("matches a substring of $field", ({ fields }) => {
    expect(matches("igita", fields)).toBe(true);
  });

  it("matches title, artist and album independently", () => {
    const fields = { title: "One More Time", artists: ["Daft Punk"], album: "Discovery" };

    expect(matches("more", fields)).toBe(true);
    expect(matches("punk", fields)).toBe(true);
    expect(matches("cover", fields)).toBe(true);
    expect(matches("jazz", fields)).toBe(false);
  });

  it("requires every term, each in any field", () => {
    const fields = { title: "One More Time", artists: ["Daft Punk"], album: "Discovery" };

    expect(matches("daft disc", fields)).toBe(true);
    expect(matches("time   punk", fields)).toBe(true);
    expect(matches("daft jazz", fields)).toBe(false);
  });

  it("does not match a term across two fields", () => {
    expect(matches("timedaft", { title: "One More Time", artists: ["Daft Punk"] })).toBe(false);
  });

  it("ignores case and accents in both the text and the track", () => {
    expect(matches("BEYONCE", { artists: ["Beyoncé"] })).toBe(true);
    expect(matches("beyoncé", { artists: ["Beyonce"] })).toBe(true);
    expect(matches("beyonce", { artists: [`Beyonce${String.fromCodePoint(0x301)}`] })).toBe(true);
    expect(matches("sigur ros", { artists: ["Sigur Rós"] })).toBe(true);
    expect(matches("motorhead", { artists: ["MOTÖRHEAD"] })).toBe(true);
    expect(matches("ÅNGEST", { title: "ångest" })).toBe(true);
  });

  it("matches Japanese and Chinese titles by plain substring", () => {
    expect(matches("夜に駆", { title: "夜に駆ける" })).toBe(true);
    expect(matches("ギター", { title: "ギターと孤独と蒼い惑星" })).toBe(true);
    expect(matches("が", { title: "ありがとう" })).toBe(true);
    expect(matches("か", { title: "ありがとう" })).toBe(false);
    expect(matches("月亮", { title: "月亮代表我的心" })).toBe(true);
    expect(matches("太陽", { title: "夜に駆ける" })).toBe(false);
  });

  it("matches an untagged track by its title only", () => {
    expect(matches("echo", { title: "echo" })).toBe(true);
    expect(matches("null", { title: "echo" })).toBe(false);
  });

  it("reflects a changed Track object, since a like or rescan replaces it", () => {
    const filter = parseTrackFilter("new");

    if (!filter) throw new Error("Expected a filter");
    const before = track({ title: "Old" });

    expect(matchesTrackFilter(before, filter)).toBe(false);
    expect(matchesTrackFilter({ ...before, title: "New" }, filter)).toBe(true);
    expect(matchesTrackFilter(before, filter)).toBe(false);
  });
});
