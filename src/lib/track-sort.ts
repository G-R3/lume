import { z } from "zod";
import type { PlaylistDetails, Track } from "../../shared/lib";
import type { SourceIdentity } from "./queue/model";

export const sortFields = [
  {
    field: "added",
    label: "Recently added",
    column: true,
    directions: { asc: "Oldest first", desc: "Newest first" },
  },
  { field: "title", label: "Title", column: true, directions: { asc: "A to Z", desc: "Z to A" } },
  {
    field: "artist",
    label: "Artist",
    column: false,
    directions: { asc: "A to Z", desc: "Z to A" },
  },
  { field: "album", label: "Album", column: true, directions: { asc: "A to Z", desc: "Z to A" } },
  {
    field: "duration",
    label: "Duration",
    column: true,
    directions: { asc: "Shortest first", desc: "Longest first" },
  },
] as const;

export type SortField = (typeof sortFields)[number]["field"];

export type SortDirection = "asc" | "desc";

export type TrackSort = Readonly<{ field: SortField; direction: SortDirection }>;

const sortDirections = ["asc", "desc"] as const satisfies readonly SortDirection[];

const internedSorts = new Map<string, TrackSort>(
  sortFields.flatMap(({ field }) =>
    sortDirections.map((direction) => [`${field}:${direction}`, { field, direction }] as const),
  ),
);

/** The same field and direction always return the same object. */
export function trackSort(field: SortField, direction: SortDirection): TrackSort {
  const sort = internedSorts.get(`${field}:${direction}`);

  if (!sort) throw new Error(`Unknown sort ${field}:${direction}`);

  return sort;
}

export const defaultSort = trackSort("added", "asc");

export const trackSortSchema = z
  .object({
    field: z.enum(sortFields.map(({ field }) => field)),
    direction: z.enum(sortDirections),
  })
  .transform(({ field, direction }) => trackSort(field, direction));

export function sortFieldInfo(field: SortField) {
  const info = sortFields.find((candidate) => candidate.field === field);

  if (!info) throw new Error(`Unknown sort field ${field}`);

  return info;
}

/** Steps a field through asc, desc, then back to the default. A different field starts at asc. */
export function nextSort(current: TrackSort, field: SortField): TrackSort {
  if (current.field !== field) return trackSort(field, "asc");

  return current.direction === "asc" ? trackSort(field, "desc") : defaultSort;
}

export function formatTrackSort(sort: TrackSort): `${SortField}:${SortDirection}` {
  return `${sort.field}:${sort.direction}`;
}

export function parseTrackSort(raw: string | null): TrackSort {
  return (raw !== null && internedSorts.get(raw)) || defaultSort;
}

/** "Duration" when idle, "Duration, shortest first" when the list is sorted by it. */
export function sortName(sort: TrackSort, field: SortField) {
  const info = sortFieldInfo(field);

  if (sort.field !== field) return info.label;

  return `${info.label}, ${info.directions[sort.direction].toLowerCase()}`;
}

/** A row of a list. `addedAt` is when the track joined this list. */
export type TrackRow = Readonly<{ sourceEntryId: number; track: Track; addedAt: number }>;

const libraryRowCache = new WeakMap<readonly Track[], readonly TrackRow[]>();

export function libraryRows(tracks: readonly Track[]): readonly TrackRow[] {
  const cached = libraryRowCache.get(tracks);

  if (cached) return cached;

  const rows = tracks.map((track) => ({ sourceEntryId: track.id, track, addedAt: track.addedAt }));
  libraryRowCache.set(tracks, rows);

  return rows;
}

/** Playlist order, without entries whose track left the library. */
export function playlistRows(
  playlist: PlaylistDetails,
  tracksById: ReadonlyMap<number, Track>,
): readonly TrackRow[] {
  return playlist.tracks.flatMap((entry) => {
    const track = tracksById.get(entry.trackId);

    return track ? [{ sourceEntryId: entry.id, track, addedAt: entry.addedAt }] : [];
  });
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

type SortKeys = {
  index: number;
  row: TrackRow;
  title: string | null;
  artist: string | null;
  album: string | null;
  disc: number | null;
  trackNumber: number | null;
  duration: number | null;
};

function sortKeys(row: TrackRow, index: number): SortKeys {
  const { track } = row;

  return {
    index,
    row,
    title: track.title || null,
    artist: track.artists.join(", ") || null,
    album: track.album || null,
    disc: track.discNumber,
    trackNumber: track.trackNumber,
    duration: track.duration,
  };
}

function missingLast(leftMissing: boolean, rightMissing: boolean) {
  return Number(leftMissing) - Number(rightMissing);
}

function compareText(left: string | null, right: string | null) {
  if (left === null || right === null) return missingLast(left === null, right === null);

  return collator.compare(left, right);
}

function compareNumber(left: number | null, right: number | null) {
  if (left === null || right === null) return missingLast(left === null, right === null);

  return left - right;
}

const compareDiscOrder = (left: SortKeys, right: SortKeys) =>
  compareNumber(left.disc, right.disc) || compareNumber(left.trackNumber, right.trackNumber);

const compareAlbumOrder = (left: SortKeys, right: SortKeys) =>
  compareText(left.album, right.album) || compareDiscOrder(left, right);

const noOrder = () => 0;

const fieldOrders: Record<
  SortField,
  {
    compare: (left: SortKeys, right: SortKeys) => number;
    missing: (keys: SortKeys) => boolean;
    within: (left: SortKeys, right: SortKeys) => number;
  }
> = {
  added: {
    compare: (left, right) => left.row.addedAt - right.row.addedAt,
    missing: () => false,
    within: noOrder,
  },
  title: {
    compare: (left, right) => compareText(left.title, right.title),
    missing: (keys) => keys.title === null,
    within: noOrder,
  },
  artist: {
    compare: (left, right) => compareText(left.artist, right.artist),
    missing: (keys) => keys.artist === null,
    within: compareAlbumOrder,
  },
  album: {
    compare: (left, right) => compareText(left.album, right.album),
    missing: (keys) => keys.album === null,
    within: compareDiscOrder,
  },
  duration: {
    compare: (left, right) => compareNumber(left.duration, right.duration),
    missing: (keys) => keys.duration === null,
    within: noOrder,
  },
};

// Missing values sort last in both directions and only the main field reverses, so the
// direction multiplies one term. The sourceEntryId tie makes the order total.
function rowComparator(sort: TrackSort) {
  const order = fieldOrders[sort.field];
  const sign = sort.direction === "asc" ? 1 : -1;

  return (left: SortKeys, right: SortKeys) =>
    missingLast(order.missing(left), order.missing(right)) ||
    sign * order.compare(left, right) ||
    order.within(left, right) ||
    compareText(left.title, right.title) ||
    left.row.addedAt - right.row.addedAt ||
    left.row.sourceEntryId - right.row.sourceEntryId;
}

function sameSortKeys(left: TrackRow, right: TrackRow) {
  if (left.sourceEntryId !== right.sourceEntryId || left.addedAt !== right.addedAt) return false;

  if (left.track === right.track) return true;

  const a = left.track;
  const b = right.track;

  return (
    a.title === b.title &&
    a.album === b.album &&
    a.discNumber === b.discNumber &&
    a.trackNumber === b.trackNumber &&
    a.duration === b.duration &&
    a.artists.length === b.artists.length &&
    a.artists.every((artist, index) => artist === b.artists[index])
  );
}

function sameRow(left: TrackRow, right: TrackRow) {
  return (
    left === right ||
    (left.track === right.track &&
      left.addedAt === right.addedAt &&
      left.sourceEntryId === right.sourceEntryId)
  );
}

type SortSlot = { input: readonly TrackRow[]; order: Int32Array; output: readonly TrackRow[] };

// One slot per view and sort, so a view and a playback session sorted differently both stay warm.
const sortSlots = new Map<string, SortSlot>();

function viewKey(view: SourceIdentity) {
  return view.kind === "all-tracks" ? "all-tracks" : `playlist:${view.playlistId}`;
}

function reuseSlot(slot: SortSlot, rows: readonly TrackRow[]): readonly TrackRow[] | null {
  if (slot.input === rows) return slot.output;

  if (slot.input.length !== rows.length) return null;

  let unchanged = true;

  for (let index = 0; index < rows.length; index++) {
    const previous = slot.input[index];
    const row = rows[index];

    if (sameRow(previous, row)) continue;

    if (!sameSortKeys(previous, row)) return null;
    unchanged = false;
  }

  // Equal keys at every position give the same permutation, because the comparator is total.
  const output = unchanged ? slot.output : Array.from(slot.order, (index) => rows[index]);
  slot.input = rows;
  slot.output = output;

  return output;
}

/** Sorts a view's rows. Returns the previous array while the rows stay the same. */
export function sortRows(
  view: SourceIdentity,
  rows: readonly TrackRow[],
  sort: TrackSort,
): readonly TrackRow[] {
  const key = `${viewKey(view)}|${formatTrackSort(sort)}`;
  const slot = sortSlots.get(key);
  const reused = slot && reuseSlot(slot, rows);

  if (reused) return reused;

  const compare = rowComparator(sort);
  const sorted = rows.map(sortKeys).sort(compare);
  const order = Int32Array.from(sorted, (keys) => keys.index);
  const output = sorted.map((keys) => keys.row);
  sortSlots.set(key, { input: rows, order, output });

  return output;
}

export function dropSortSlots(view: SourceIdentity) {
  const prefix = `${viewKey(view)}|`;

  for (const key of sortSlots.keys()) if (key.startsWith(prefix)) sortSlots.delete(key);
}
