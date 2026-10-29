import { describe, expect, it } from "vite-plus/test";
import type { PlaylistDetails, Track } from "../../shared/lib";
import {
  defaultSort,
  formatTrackSort,
  libraryRows,
  nextSort,
  parseTrackSort,
  playlistRows,
  sortFields,
  sortName,
  sortRows,
  trackSort,
  type SortField,
  type TrackRow,
  type TrackSort,
} from "./track-sort";

let nextId = 1;

let nextPlaylistId = 1;

function track(fields: Partial<Track> = {}): Track {
  const id = fields.id ?? nextId++;

  return {
    addedAt: id,
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
    likedAt: null,
    lossless: true,
    sampleRate: null,
    title: `Track ${id}`,
    trackNumber: null,
    trackTotal: null,
    url: `lume://track/${id}`,
    year: null,
    ...fields,
    id,
  };
}

function freshView() {
  return { kind: "playlist", playlistId: nextPlaylistId++ } as const;
}

function sortTitles(tracks: Track[], sort: TrackSort) {
  return sortRows(freshView(), libraryRows(tracks), sort).map((row) => row.track.title);
}

function bothOrders(tracks: Track[], field: SortField) {
  return {
    asc: sortTitles(tracks, trackSort(field, "asc")),
    desc: sortTitles(tracks, trackSort(field, "desc")),
  };
}

describe("nextSort", () => {
  const fields = sortFields.map(({ field }) => field);

  it.each(fields.filter((field) => field !== "added"))(
    "steps %s through asc, desc, then the default",
    (field) => {
      const first = nextSort(defaultSort, field);
      const second = nextSort(first, field);

      expect([first, second, nextSort(second, field)]).toEqual([
        trackSort(field, "asc"),
        trackSort(field, "desc"),
        defaultSort,
      ]);
    },
  );

  it("toggles recently added between oldest and newest first", () => {
    const newest = nextSort(defaultSort, "added");

    expect([newest, nextSort(newest, "added")]).toEqual([trackSort("added", "desc"), defaultSort]);
  });

  it.each(fields.flatMap((from) => fields.filter((to) => to !== from).map((to) => [from, to])))(
    "starts %s -> %s at the first step from either direction",
    (from, to) => {
      expect(nextSort(trackSort(from, "asc"), to)).toBe(trackSort(to, "asc"));
      expect(nextSort(trackSort(from, "desc"), to)).toBe(trackSort(to, "asc"));
    },
  );

  it("defaults to recently added, oldest first", () => {
    expect(defaultSort).toEqual({ field: "added", direction: "asc" });
  });
});

describe("parse and format", () => {
  it("round-trips every field and direction to the same value", () => {
    for (const { field } of sortFields) {
      for (const direction of ["asc", "desc"] as const) {
        const sort = trackSort(field, direction);

        expect(parseTrackSort(formatTrackSort(sort))).toBe(sort);
      }
    }
  });

  it.each([null, "", "added", "title", "title:up", "genre:asc", "title:asc:x", "toString"])(
    "reads %j as the default",
    (raw) => {
      expect(parseTrackSort(raw)).toBe(defaultSort);
    },
  );
});

describe("sortName", () => {
  it("names the field, and its direction when sorted by it", () => {
    expect(sortName(defaultSort, "duration")).toBe("Duration");
    expect(sortName(trackSort("duration", "asc"), "duration")).toBe("Duration, shortest first");
    expect(sortName(defaultSort, "added")).toBe("Recently added, oldest first");
    expect(sortName(trackSort("title", "desc"), "title")).toBe("Title, z to a");
  });
});

describe("sortRows", () => {
  it("orders titles with accents and numbers, empty last, whatever the input order", () => {
    const tracks = [
      track({ title: "Track 10" }),
      track({ title: "" }),
      track({ title: "éclair" }),
      track({ title: "Track 2" }),
      track({ title: "Apple" }),
    ];

    const expected = ["Apple", "éclair", "Track 2", "Track 10", ""];

    expect(sortTitles(tracks, trackSort("title", "asc"))).toEqual(expected);
    expect(sortTitles(tracks.toReversed(), trackSort("title", "asc"))).toEqual(expected);
    expect(sortTitles(tracks, trackSort("title", "desc"))).toEqual([
      "Track 10",
      "Track 2",
      "éclair",
      "Apple",
      "",
    ]);
  });

  it("puts missing albums, artists and durations last in both directions", () => {
    const missing = [
      track({ title: "No album", album: null }),
      track({ title: "No artist", album: "B", artists: [] }),
      track({ title: "No duration", album: "C", artists: ["Z"], duration: null }),
    ];

    const tagged = [
      track({ title: "A1", album: "A", artists: ["X"], duration: 10 }),
      track({ title: "D1", album: "D", artists: ["Y"], duration: 20 }),
    ];

    const tracks = [...missing, ...tagged];

    expect(bothOrders(tracks, "album")).toEqual({
      asc: ["A1", "No artist", "No duration", "D1", "No album"],
      desc: ["D1", "No duration", "No artist", "A1", "No album"],
    });
    expect(bothOrders(tracks, "artist")).toEqual({
      asc: ["A1", "D1", "No duration", "No artist", "No album"],
      desc: ["No duration", "D1", "A1", "No artist", "No album"],
    });
    expect(bothOrders(tracks, "duration")).toEqual({
      asc: ["A1", "D1", "No album", "No artist", "No duration"],
      desc: ["No album", "No artist", "D1", "A1", "No duration"],
    });
  });

  it("sorts a 0:00 duration as a value", () => {
    const tracks = [
      track({ title: "Unknown", duration: null }),
      track({ title: "Long", duration: 300 }),
      track({ title: "Silent", duration: 0 }),
    ];

    expect(bothOrders(tracks, "duration")).toEqual({
      asc: ["Silent", "Long", "Unknown"],
      desc: ["Long", "Silent", "Unknown"],
    });
  });

  it("keeps disc and track order inside an album in both directions", () => {
    const tracks = [
      track({ title: "B 2-1", album: "B", discNumber: 2, trackNumber: 1 }),
      track({ title: "B 1-2", album: "B", discNumber: 1, trackNumber: 2 }),
      track({ title: "A 1-1", album: "A", discNumber: 1, trackNumber: 1 }),
      track({ title: "B 1-1", album: "B", discNumber: 1, trackNumber: 1 }),
    ];

    expect(bothOrders(tracks, "album")).toEqual({
      asc: ["A 1-1", "B 1-1", "B 1-2", "B 2-1"],
      desc: ["B 1-1", "B 1-2", "B 2-1", "A 1-1"],
    });
  });

  it("keeps album order inside an artist in both directions", () => {
    const tracks = [
      track({ title: "Y-B2", artists: ["Y"], album: "B", trackNumber: 2 }),
      track({ title: "X-A1", artists: ["X"], album: "A", trackNumber: 1 }),
      track({ title: "Y-A1", artists: ["Y"], album: "A", trackNumber: 1 }),
      track({ title: "Y-B1", artists: ["Y"], album: "B", trackNumber: 1 }),
    ];

    expect(bothOrders(tracks, "artist")).toEqual({
      asc: ["X-A1", "Y-A1", "Y-B1", "Y-B2"],
      desc: ["Y-A1", "Y-B1", "Y-B2", "X-A1"],
    });
  });

  it("breaks ties by title, then by when the track was added", () => {
    const tracks = [
      track({ title: "Same", duration: 60, addedAt: 20, id: 901 }),
      track({ title: "Beta", duration: 60, addedAt: 5, id: 902 }),
      track({ title: "Same", duration: 60, addedAt: 10, id: 903 }),
      track({ title: "Alpha", duration: 60, addedAt: 30, id: 904 }),
    ];

    const ids = (sort: TrackSort) =>
      sortRows(freshView(), libraryRows(tracks), sort).map((row) => row.track.id);

    expect(ids(trackSort("duration", "asc"))).toEqual([904, 902, 903, 901]);
    expect(ids(trackSort("duration", "desc"))).toEqual([904, 902, 903, 901]);
  });

  it("sorts playlist rows by when they joined the playlist, not by import time", () => {
    const early = track({ title: "Imported first", addedAt: 1 });
    const late = track({ title: "Imported last", addedAt: 2 });

    const playlist: PlaylistDetails = {
      id: 1,
      title: "Mix",
      description: null,
      tracks: [
        { id: 51, trackId: early.id, position: 0, addedAt: 200 },
        { id: 52, trackId: late.id, position: 1, addedAt: 100 },
        { id: 53, trackId: 999_999, position: 2, addedAt: 50 },
      ],
    };

    const rows = playlistRows(playlist, new Map([early, late].map((track) => [track.id, track])));

    expect(
      sortRows(freshView(), rows, defaultSort).map((row) => [row.track.title, row.addedAt]),
    ).toEqual([
      ["Imported last", 100],
      ["Imported first", 200],
    ]);
  });
});

describe("sortRows cache", () => {
  const titleSort = trackSort("title", "asc");

  function library() {
    return [
      track({ title: "C" }),
      track({ title: "A" }),
      track({ title: "B" }),
      track({ title: "D" }),
    ];
  }

  it("returns the same array for the same rows", () => {
    const view = freshView();
    const rows = libraryRows(library());

    expect(sortRows(view, rows, titleSort)).toBe(sortRows(view, rows, titleSort));
  });

  it("returns the new track objects after one track is replaced", () => {
    const view = freshView();
    const tracks = library();
    const before = sortRows(view, libraryRows(tracks), titleSort);
    const liked = { ...tracks[2], likedAt: 1 };
    const after = sortRows(view, libraryRows(tracks.with(2, liked)), titleSort);

    expect(after).not.toBe(before);
    expect(after.map((row) => row.track.title)).toEqual(["A", "B", "C", "D"]);
    expect(after.find((row) => row.track.id === liked.id)?.track).toBe(liked);
  });

  it("returns the same array for rebuilt rows that are unchanged", () => {
    const view = freshView();
    const tracks = library();

    const rebuild = (): TrackRow[] =>
      tracks.map((track) => ({ sourceEntryId: track.id, track, addedAt: track.addedAt }));

    expect(sortRows(view, rebuild(), titleSort)).toBe(sortRows(view, rebuild(), titleSort));
  });

  it("sorts again when a sort key changes", () => {
    const view = freshView();
    const tracks = library();
    sortRows(view, libraryRows(tracks), titleSort);
    const renamed = tracks.with(1, { ...tracks[1], title: "Z" });

    expect(sortRows(view, libraryRows(renamed), titleSort).map((row) => row.track.title)).toEqual([
      "B",
      "C",
      "D",
      "Z",
    ]);
  });

  it("keeps each sort of a view separate", () => {
    const view = freshView();
    const rows = libraryRows(library());
    const byTitle = sortRows(view, rows, titleSort);
    const byTitleDesc = sortRows(view, rows, trackSort("title", "desc"));

    expect(byTitleDesc.map((row) => row.track.title)).toEqual(["D", "C", "B", "A"]);
    expect(sortRows(view, rows, titleSort)).toBe(byTitle);
  });
});
