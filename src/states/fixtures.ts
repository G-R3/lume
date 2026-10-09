// Fixture data for the states page and the sandbox seeder (scripts/sandbox). Values are copied from
// the Paper file "Lume V2", page "Screens & states": frame 17 (component states) and frame 08c
// (rough data). Nothing in the production app imports this file.

import type { Track } from "../../shared/lib";

/** One gradient stop in OKLab, as Paper writes it: lightness in percent, then a and b. */
export type OklabStop = readonly [lightness: number, a: number, b: number];

export type FixtureTrack = {
  /** Shown on the "Added" column in Paper; seeded as the track's creation time. */
  added: string;
  album: string | null;
  artists: readonly string[];
  /** Paper draws artwork as a 140° OKLab gradient. `null` means the track has no artwork. */
  artwork: readonly OklabStop[] | null;
  available: boolean;
  /** Seconds. */
  duration: number;
  /** File name without its extension. Tracks without a title tag show it as their title. */
  fileName: string;
  liked: boolean;
  /** `null` means the file has no title tag. */
  title: string | null;
};

const now = new Date("2026-10-08T12:00:00");

const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000).toISOString();

/** Frame 08c, "Stress test — rough data", top to bottom. */
export const roughDataTracks: readonly FixtureTrack[] = [
  {
    added: hoursAgo(0),
    album:
      "Fuyü-Kükan (40th Anniversary Deluxe Edition, Remastered from the Original Analog Tapes)",
    artists: ["Tomoko Aran"],
    artwork: [
      [39.2, 0.04, -0.077],
      [64.6, 0.078, -0.029],
    ],
    available: true,
    duration: 12 * 60 + 48,
    fileName: "midnight-pretenders-extended",
    liked: false,
    title:
      "Midnight Pretenders (Extended 12″ Version) [2023 Remaster] – Live at Nakano Sunplaza, Tokyo, December 1983",
  },
  {
    added: hoursAgo(0),
    album: "Flower Boy",
    artists: [
      "Tyler, The Creator",
      "Kali Uchis",
      "Daniel Caesar",
      "Brent Faiyaz",
      "Steve Lacy",
      "Frank Ocean",
      "Rex Orange County",
    ],
    artwork: [
      [49.1, 0.021, 0.071],
      [78.3, 0.015, 0.1],
    ],
    available: true,
    duration: 3 * 60,
    fileName: "see-you-again",
    liked: true,
    title: "See You Again",
  },
  {
    added: hoursAgo(0),
    album: "Variety (Demos)",
    artists: ["Mariya Takeuchi"],
    artwork: null,
    available: true,
    duration: 4 * 60 + 12,
    fileName: "plastic-love-demo",
    liked: false,
    title: "Plastic Love (Demo)",
  },
  {
    added: hoursAgo(0),
    album: null,
    artists: [],
    artwork: null,
    available: true,
    duration: 3 * 60 + 33,
    fileName: "01 - track_final_v2 (1)",
    liked: false,
    title: null,
  },
  {
    added: hoursAgo(3),
    album: "POCKET PARK",
    artists: ["松原みき"],
    artwork: [
      [40.4, -0.018, -0.068],
      [74.3, 0.033, 0.047],
    ],
    available: true,
    duration: 5 * 60 + 24,
    fileName: "mayonaka-no-door",
    liked: true,
    title: "真夜中のドア〜stay with me",
  },
  {
    added: hoursAgo(26),
    album: "Andalusiyat",
    artists: ["فيروز"],
    artwork: [
      [36.5, 0.065, 0.025],
      [71.7, 0.071, 0.076],
    ],
    available: true,
    duration: 4 * 60 + 58,
    fileName: "lamma-bada",
    liked: false,
    title: "لما بدا يتثنى",
  },
  {
    added: "2026-09-28T21:00:00",
    album: "≈ waves ≈",
    artists: ["bedroom"],
    artwork: [
      [30.2, -0.009, -0.055],
      [62.4, -0.02, -0.065],
    ],
    available: true,
    duration: 2 * 60 + 47,
    fileName: "night-swim",
    liked: false,
    title: "🌙 night swim (slowed + reverb)",
  },
  {
    added: "2026-09-28T20:00:00",
    album: "BBC Radio 1",
    artists: ["Four Tet"],
    artwork: [
      [28.5, 0, 0],
      [63.3, 0, 0],
    ],
    available: true,
    duration: 3600 + 59 * 60 + 48,
    fileName: "essential-mix-2019",
    liked: false,
    title: "Essential Mix – 2 March 2019",
  },
  {
    added: "2026-09-27T20:00:00",
    album: "Sleep",
    artists: ["Max Richter"],
    artwork: [
      [27.9, -0.013, -0.034],
      [51.3, -0.023, -0.059],
    ],
    available: true,
    duration: 8 * 3600 + 24 * 60 + 43,
    fileName: "sleep-complete",
    liked: false,
    title: "Sleep (Complete)",
  },
  {
    added: "2026-09-24T20:00:00",
    album: "OutRun",
    artists: ["Kavinsky"],
    artwork: [
      [27, 0.055, -0.009],
      [46.6, 0.114, -0.005],
    ],
    available: false,
    duration: 4 * 60 + 18,
    fileName: "nightcall",
    liked: false,
    title: "Nightcall (Drive Original Motion Picture Soundtrack Version) [feat. Lovefoxxx]",
  },
];

/** Frame 17, "Track row", one track per state. */
export const componentStateTracks = {
  default: {
    added: hoursAgo(2),
    album: "Fuyü-Kükan",
    artists: ["Tomoko Aran"],
    artwork: [
      [34, 0.03, -0.071],
      [67.8, 0.1, -0.017],
    ],
    available: true,
    duration: 5 * 60 + 1,
    fileName: "midnight-pretenders",
    liked: false,
    title: "Midnight Pretenders",
  },
  hover: {
    added: "2026-09-28T20:00:00",
    album: "Blonde",
    artists: ["Frank Ocean"],
    artwork: [
      [81.7, 0.004, 0.015],
      [95.1, 0.002, 0.009],
    ],
    available: true,
    duration: 3 * 60 + 4,
    fileName: "pink-white",
    liked: true,
    title: "Pink + White",
  },
  focus: {
    added: hoursAgo(2),
    album: "Pocket Park",
    artists: ["Miki Matsubara"],
    artwork: [
      [33.6, -0.023, -0.041],
      [74.8, 0.036, 0.104],
    ],
    available: true,
    duration: 5 * 60 + 24,
    fileName: "stay-with-me",
    liked: true,
    title: "Stay With Me",
  },
  selected: {
    added: "2026-10-01T20:00:00",
    album: "Mezzanine",
    artists: ["Massive Attack"],
    artwork: [
      [19.1, 0, 0],
      [34.8, 0, 0],
    ],
    available: true,
    duration: 5 * 60 + 29,
    fileName: "teardrop",
    liked: true,
    title: "Teardrop",
  },
  playing: {
    added: hoursAgo(2),
    album: "Variety",
    artists: ["Mariya Takeuchi"],
    artwork: [
      [42.7, -0.015, -0.112],
      [62, -0.019, -0.11],
      [83.4, 0.015, 0.082],
    ],
    available: true,
    duration: 7 * 60 + 53,
    fileName: "plastic-love",
    liked: true,
    title: "Plastic Love",
  },
  unavailable: {
    added: "2026-09-24T20:00:00",
    album: "OutRun",
    artists: ["Kavinsky"],
    artwork: [
      [28.4, 0.057, -0.045],
      [61.4, 0.187, 0.009],
    ],
    available: false,
    duration: 4 * 60 + 18,
    fileName: "nightcall-short",
    liked: false,
    title: "Nightcall",
  },
} satisfies Record<string, FixtureTrack>;

/** Frame 08c's sidebar playlist, plus one short title. */
export const fixturePlaylists = [
  {
    description: null,
    title: "Late-night drives through Tokyo in the rain, vol. 2",
  },
  {
    description: "For slow mornings",
    title: "Rainy Sunday",
  },
] as const;

/** Paper's 140° OKLab gradient as an SVG, usable as an `<img>` source or stored artwork. */
export function createArtworkSvg(stops: readonly OklabStop[]) {
  const gradientStops = stops
    .map(
      ([lightness, a, b], index) =>
        `<stop offset="${stops.length === 1 ? 0 : index / (stops.length - 1)}" stop-color="oklab(${lightness}% ${a} ${b})"/>`,
    )
    .join("");

  // 140° in CSS points toward the bottom right, 50° clockwise from "to right".
  return `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256"><defs><linearGradient id="g" gradientTransform="rotate(50 0.5 0.5)">${gradientStops}</linearGradient></defs><rect width="256" height="256" fill="url(#g)"/></svg>`;
}

export function createArtworkDataUrl(stops: readonly OklabStop[]) {
  return `data:image/svg+xml,${encodeURIComponent(createArtworkSvg(stops))}`;
}

export function toTrack(fixture: FixtureTrack, id: number): Track {
  const artists = fixture.artists.length > 0 ? [...fixture.artists] : ["Unknown artist"];

  return {
    addedAt: Date.parse(fixture.added),
    album: fixture.album ?? "Unknown album",
    albumArtists: artists,
    artists,
    artworkUrl: fixture.artwork ? createArtworkDataUrl(fixture.artwork) : null,
    available: fixture.available,
    bitrate: null,
    bitsPerSample: null,
    channelCount: null,
    codec: null,
    discNumber: null,
    discTotal: null,
    duration: fixture.duration,
    format: "FLAC",
    genres: [],
    id,
    likedAt: fixture.liked ? 1 : null,
    lossless: true,
    sampleRate: null,
    title: fixture.title ?? fixture.fileName,
    trackNumber: null,
    trackTotal: null,
    url: "",
    year: null,
  };
}
