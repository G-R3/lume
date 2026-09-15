import { randomUUID } from "node:crypto";
import { realpath, stat } from "node:fs/promises";
import { isAbsolute, relative } from "node:path";
import { and, count, eq, isNotNull, isNull, sql, type SQL } from "drizzle-orm";
import type { LibrarySource } from "../shared/lib";
import { runLibraryTransaction, type LibraryDatabase } from "./database";
import { librarySources, tracks } from "./database/schema";

type SourceWriter = Pick<LibraryDatabase, "update">;

export function getSources(database: LibraryDatabase): LibrarySource[] {
  return selectSources(database, isNull(librarySources.forgottenAt))
    .orderBy(librarySources.createdAt)
    .all();
}

export function getEnabledSources(database: LibraryDatabase): LibrarySource[] {
  return selectSources(
    database,
    and(eq(librarySources.enabled, true), isNull(librarySources.forgottenAt)),
  )
    .orderBy(librarySources.createdAt)
    .all();
}

export function getSource(database: LibraryDatabase, sourceId: string): LibrarySource {
  const source = selectSources(
    database,
    and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)),
  ).get();

  if (source) return source;
  throw new Error(`Library source ${sourceId} does not exist`);
}

export function getEnabledSource(
  database: LibraryDatabase,
  sourceId: string,
): LibrarySource | null {
  return (
    selectSources(
      database,
      and(
        eq(librarySources.id, sourceId),
        eq(librarySources.enabled, true),
        isNull(librarySources.forgottenAt),
      ),
    ).get() ?? null
  );
}

export function hasForgottenSources(database: LibraryDatabase) {
  return (
    database
      .select({ id: librarySources.id })
      .from(librarySources)
      .where(isNotNull(librarySources.forgottenAt))
      .get() !== undefined
  );
}

export async function saveSource(
  database: LibraryDatabase,
  selectedPath: string,
): Promise<Pick<LibrarySource, "id" | "path">> {
  const path = await realpath(selectedPath);
  const folder = await stat(path);

  if (!folder.isDirectory()) throw new Error("A music source must be a folder");

  const existing = database
    .select({ id: librarySources.id })
    .from(librarySources)
    .where(eq(librarySources.path, path))
    .get();

  if (existing) {
    rejectSourceOverlap(database, path, existing.id);
    const now = Date.now();

    database
      .update(librarySources)
      .set({
        enabled: true,
        forgottenAt: null,
        updatedAt: sql`CASE
          WHEN ${librarySources.enabled} = 0 OR ${librarySources.forgottenAt} IS NOT NULL THEN ${now}
          ELSE ${librarySources.updatedAt}
        END`,
      })
      .where(eq(librarySources.id, existing.id))
      .run();

    return { id: existing.id, path };
  }

  rejectSourceOverlap(database, path);

  const id = randomUUID();
  const now = Date.now();
  database
    .insert(librarySources)
    .values({
      createdAt: now,
      enabled: true,
      id,
      path,
      updatedAt: now,
    })
    .run();

  return { id, path };
}

export function enableSource(database: LibraryDatabase, sourceId: string) {
  const now = Date.now();

  const result = database
    .update(librarySources)
    .set({
      enabled: true,
      updatedAt: sql`CASE
        WHEN ${librarySources.enabled} = 0 THEN ${now}
        ELSE ${librarySources.updatedAt}
      END`,
    })
    .where(and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)))
    .run();

  if (result.changes !== 1 && result.changes !== 1n) {
    throw new Error(`Library source ${sourceId} is not active`);
  }
}

export function disableSource(database: LibraryDatabase, sourceId: string) {
  const now = Date.now();

  runLibraryTransaction(database, (transaction) => {
    const result = transaction
      .update(librarySources)
      .set({
        enabled: false,
        updatedAt: sql`CASE
            WHEN ${librarySources.enabled} = 1 THEN ${now}
            ELSE ${librarySources.updatedAt}
          END`,
      })
      .where(and(eq(librarySources.id, sourceId), isNull(librarySources.forgottenAt)))
      .run();

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Library source ${sourceId} is not active`);
    }

    markSourceTracksUnavailable(transaction, sourceId, now);
  });
}

export function forgetSource(database: LibraryDatabase, sourceId: string) {
  const now = Date.now();

  runLibraryTransaction(database, (transaction) => {
    const result = transaction
      .update(librarySources)
      .set({
        enabled: false,
        forgottenAt: sql`COALESCE(${librarySources.forgottenAt}, ${now})`,
        updatedAt: sql`CASE
            WHEN ${librarySources.enabled} = 1 OR ${librarySources.forgottenAt} IS NULL THEN ${now}
            ELSE ${librarySources.updatedAt}
          END`,
      })
      .where(eq(librarySources.id, sourceId))
      .run();

    if (result.changes !== 1 && result.changes !== 1n) {
      throw new Error(`Library source ${sourceId} does not exist`);
    }

    markSourceTracksUnavailable(transaction, sourceId, now);
  });
}

export function applyScanFailure(database: LibraryDatabase, sourceId: string, error: string) {
  if (!isSourceScannable(database, sourceId)) return false;

  const now = Date.now();

  runLibraryTransaction(database, (transaction) => {
    markSourceTracksUnavailable(transaction, sourceId, now);
    transaction
      .update(librarySources)
      .set({ lastScanError: error, updatedAt: now })
      .where(eq(librarySources.id, sourceId))
      .run();
  });

  return true;
}

export function isSourceScannable(database: LibraryDatabase, sourceId: string) {
  return (
    database
      .select({ id: librarySources.id })
      .from(librarySources)
      .where(
        and(
          eq(librarySources.id, sourceId),
          eq(librarySources.enabled, true),
          isNull(librarySources.forgottenAt),
        ),
      )
      .get() !== undefined
  );
}

export function markSourceTracksUnavailable(database: SourceWriter, sourceId: string, now: number) {
  database
    .update(tracks)
    .set({ available: false, updatedAt: now })
    .where(and(eq(tracks.sourceId, sourceId), eq(tracks.available, true)))
    .run();
}

function rejectSourceOverlap(database: LibraryDatabase, path: string, sourceId?: string) {
  const overlappingPath = database
    .select({ id: librarySources.id, path: librarySources.path })
    .from(librarySources)
    .where(isNull(librarySources.forgottenAt))
    .all()
    .find((source) => source.id !== sourceId && pathsOverlap(source.path, path));

  if (overlappingPath) {
    throw new Error(`This folder overlaps the existing source ${overlappingPath.path}`);
  }
}

function selectSources(database: LibraryDatabase, condition: SQL | undefined) {
  return database
    .select({
      enabled: librarySources.enabled,
      id: librarySources.id,
      lastScanError: librarySources.lastScanError,
      lastScannedAt: librarySources.lastScannedAt,
      path: librarySources.path,
      trackCount: count(tracks.id),
    })
    .from(librarySources)
    .leftJoin(tracks, and(eq(tracks.sourceId, librarySources.id), eq(tracks.available, true)))
    .where(condition)
    .groupBy(librarySources.id);
}

function pathsOverlap(left: string, right: string) {
  return pathContains(left, right) || pathContains(right, left);
}

function pathContains(parent: string, child: string) {
  const difference = relative(parent, child);

  return difference === "" || (!difference.startsWith("..") && !isAbsolute(difference));
}
