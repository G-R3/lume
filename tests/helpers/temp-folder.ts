import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vite-plus/test";

export async function createTemporaryFolder(prefix: string) {
  const folder = await mkdtemp(join(tmpdir(), prefix));
  // Runs after `afterEach`, so database clients and applications close before their files are removed.
  onTestFinished(() => rm(folder, { force: true, recursive: true }));

  return folder;
}
