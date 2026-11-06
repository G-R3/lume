import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { _electron as electron, type ElectronApplication } from "playwright";
import { afterEach } from "vite-plus/test";
import { closeDatabase, initializeDatabase } from "../electron/database";
import { saveSource, scanSource } from "../electron/library";
import { createPlaylist } from "../electron/playlists";
import { libraryTracks } from "../tests/helpers/library";
import { createTemporaryFolder } from "../tests/helpers/temp-folder";
import { createWaveAudio } from "../tests/helpers/wave-audio";

const launchedApplications: ElectronApplication[] = [];

export const electronEnvironment = Object.fromEntries(
  Object.entries(process.env).flatMap((entry) =>
    entry[0] === "ELECTRON_RUN_AS_NODE" || entry[1] === undefined
      ? []
      : [[entry[0], entry[1]] as const],
  ),
);

afterEach(async () => {
  closeDatabase();
  await Promise.all(
    launchedApplications.splice(0).map((application) => application.close().catch(() => {})),
  );
});

export async function launchLume(profile: string) {
  const application = await electron.launch({
    args: [".", `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env: electronEnvironment,
  });

  launchedApplications.push(application);

  return application;
}

export async function openDatabase(profile: string) {
  await initializeDatabase({
    location: join(profile, "lume-dev.sqlite"),
    migrationsFolder: join(process.cwd(), "drizzle"),
  });
}

export async function launchWithLibrary(
  prefix: string,
  titles: readonly string[],
  playlists: Readonly<Record<string, readonly string[]>> = {},
) {
  const profile = await createTemporaryFolder(prefix);
  const sourceDirectory = join(profile, "music");
  await mkdir(sourceDirectory);
  await Promise.all(
    titles.map((title) => writeFile(join(sourceDirectory, `${title}.wav`), createWaveAudio(5))),
  );

  await openDatabase(profile);
  await scanSource((await saveSource(sourceDirectory)).id);
  const idByTitle = new Map(libraryTracks().map((track) => [track.title, track.id]));

  for (const [title, trackTitles] of Object.entries(playlists)) {
    createPlaylist({
      description: null,
      title,
      trackIds: trackTitles.map((trackTitle) => idByTitle.get(trackTitle) ?? -1),
    });
  }

  closeDatabase();

  const application = await launchLume(profile);

  return application.firstWindow();
}
