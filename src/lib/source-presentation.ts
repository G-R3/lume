import type { LibrarySource, MusicLibrary, TrackUnavailableReason } from "../../shared/lib";
import { libraryRows } from "./track-sort";

export const trackUnavailableLabels: Record<TrackUnavailableReason, string> = {
  "file-missing": "File missing",
  "source-forgotten": "Folder removed",
  "source-missing": "Not connected",
  "source-off": "Folder off",
  "source-permission": "No access",
  "source-unreadable": "Can’t read folder",
};

const permissionDetail =
  "Lume does not have permission to read this folder. Allow access in System Settings, then try again.";

export type FolderPresentation = {
  id: number;
  path: string;
  name: string;
  enabled: boolean;
  hasIssue: boolean;
  statusText: string;
  tooltip: string | undefined;
  trackCountText: string | null;
  scanLabel: "Scan again" | "Rescan" | null;
};

type FolderFacts = {
  folder: FolderPresentation;
  issue: { kind: "missing" | "permission" | "failed"; detail: string } | null;
  scannedAt: number | null;
};

export type SourceNotice =
  | { kind: "none" }
  | { kind: "issue"; title: string; detail: string; sourceId: number }
  | { kind: "off"; title: string }
  | { kind: "missing-files"; title: string; detail: string };

export type SourceEmpty =
  | { kind: "hidden" }
  | { kind: "add"; title: string; description: string; chooseLabel: string }
  | {
      kind: "no-audio";
      title: string;
      description: string;
      chooseLabel: string;
      sourceId: number;
    };

export function presentLibrarySources(library: MusicLibrary, now: number) {
  const facts = library.sources.map((source) => presentFolder(source, now));

  return {
    empty: presentEmpty(library, facts),
    folders: facts.map((fact) => fact.folder),
    footer: presentFooter(facts, now),
    notice: presentNotice(library, facts),
  };
}

function presentFolder(source: LibrarySource, now: number): FolderFacts {
  const { status } = source;

  const folder = {
    enabled: status.kind !== "off",
    id: source.id,
    name: getSourceName(source.path),
    path: source.path,
  };

  switch (status.kind) {
    case "off":
      return {
        folder: {
          ...folder,
          hasIssue: false,
          scanLabel: null,
          statusText: "Off",
          tooltip: undefined,
          trackCountText: null,
        },
        issue: null,
        scannedAt: null,
      };
    case "unscanned":
      return {
        folder: {
          ...folder,
          hasIssue: false,
          scanLabel: "Rescan",
          statusText: "Not scanned yet",
          tooltip: undefined,
          trackCountText: null,
        },
        issue: null,
        scannedAt: null,
      };
    case "scanned":
      return {
        folder: {
          ...folder,
          hasIssue: false,
          scanLabel: "Rescan",
          statusText:
            status.trackCount === 0
              ? "No audio found"
              : `Scanned ${formatScanTime(status.scannedAt, now)}`,
          tooltip: undefined,
          trackCountText: status.trackCount.toLocaleString(),
        },
        issue: null,
        scannedAt: status.scannedAt,
      };
    case "missing":
    case "permission":
    case "failed": {
      const detail = displayDetail(status);

      const lastScanned =
        status.lastScannedAt === null
          ? ""
          : ` · last scanned ${formatScanTime(status.lastScannedAt, now)}`;

      return {
        folder: {
          ...folder,
          hasIssue: true,
          scanLabel: "Scan again",
          statusText:
            status.kind === "missing" ? `Not connected${lastScanned}` : `Couldn’t scan · ${detail}`,
          tooltip: detail,
          trackCountText: null,
        },
        issue: { detail, kind: status.kind },
        scannedAt: null,
      };
    }
  }
}

function displayDetail(status: { kind: "missing" | "permission" | "failed"; errorMessage: string }) {
  if (status.kind === "permission") return permissionDetail;

  return status.errorMessage || "Unknown scan error.";
}

function presentNotice(library: MusicLibrary, facts: readonly FolderFacts[]): SourceNotice {
  const failed = facts.find((fact) => fact.issue !== null);

  if (failed?.issue) {
    const { id, name } = failed.folder;

    return failed.issue.kind === "missing"
      ? {
          detail: "Its tracks can’t play until it’s back.",
          kind: "issue",
          sourceId: id,
          title: `${name} isn’t connected`,
        }
      : {
          detail: failed.issue.detail,
          kind: "issue",
          sourceId: id,
          title: `${name} couldn’t be scanned`,
        };
  }

  if (facts.length > 0 && facts.every((fact) => !fact.folder.enabled)) {
    return { kind: "off", title: "All folders are off" };
  }

  const missingCount = library.tracks.filter(
    (track) => track.unavailableReason === "file-missing",
  ).length;

  if (missingCount > 0) {
    return {
      detail: "Their files were moved or deleted since the last scan.",
      kind: "missing-files",
      title: `${missingCount.toLocaleString()} ${missingCount === 1 ? "track is" : "tracks are"} missing`,
    };
  }

  return { kind: "none" };
}

function presentFooter(facts: readonly FolderFacts[], now: number) {
  const tooltip = facts.map((fact) => fact.folder.path).join("\n") || undefined;

  if (facts.length === 0) return { text: "No folders", tooltip };

  const name = facts.length === 1 ? facts[0].folder.name : `${facts.length} folders`;
  const enabled = facts.filter((fact) => fact.folder.enabled);
  const issues = enabled.filter((fact) => fact.issue !== null).length;
  const scannedAt = enabled.flatMap((fact) => (fact.scannedAt === null ? [] : [fact.scannedAt]));

  const detail =
    enabled.length === 0
      ? facts.length === 1
        ? "off"
        : "all off"
      : issues > 0
        ? issues === 1
          ? "1 issue"
          : `${issues} issues`
        : scannedAt.length > 0
          ? formatScanAge(Math.min(...scannedAt), now)
          : null;

  return { text: detail ? `${name} · ${detail}` : name, tooltip };
}

function presentEmpty(library: MusicLibrary, facts: readonly FolderFacts[]): SourceEmpty {
  if (
    libraryRows(library.tracks).length > 0 ||
    facts.some((fact) => !fact.folder.enabled || fact.issue !== null)
  ) {
    return { kind: "hidden" };
  }

  const scanned = facts.find((fact) => fact.scannedAt !== null);

  if (!scanned) {
    return {
      chooseLabel: "Choose folder",
      description: "Choose a folder of audio files. Lume plays them where they are.",
      kind: "add",
      title: "Add your music",
    };
  }

  return {
    chooseLabel: "Choose another folder",
    description: "Lume plays FLAC, M4A, MP3, AAC, OGG, OPUS and WAV files.",
    kind: "no-audio",
    sourceId: scanned.folder.id,
    title: `No audio in “${scanned.folder.name}”`,
  };
}

function getSourceName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}

const scanDateFormatter = new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short" });

const scanDateWithYearFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

function formatScanTime(scannedAt: number, now: number) {
  const minutes = Math.floor((now - scannedAt) / 60_000);

  if (minutes < 1) return "just now";

  if (minutes < 60) return minutes === 1 ? "1 minute ago" : `${minutes} minutes ago`;

  const hours = Math.floor(minutes / 60);

  if (hours < 24) return hours === 1 ? "1 hour ago" : `${hours} hours ago`;

  return new Date(scannedAt).getFullYear() === new Date(now).getFullYear()
    ? scanDateFormatter.format(scannedAt)
    : scanDateWithYearFormatter.format(scannedAt);
}

function formatScanAge(scannedAt: number, now: number) {
  const minutes = Math.floor((now - scannedAt) / 60_000);

  if (minutes < 1) return "scanned just now";

  if (minutes < 60) return `scanned ${minutes}m`;

  if (minutes < 24 * 60) return `scanned ${Math.floor(minutes / 60)}h`;

  return `scanned ${scanDateFormatter.format(scannedAt)}`;
}
