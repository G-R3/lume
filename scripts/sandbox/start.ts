// Starts an isolated Lume instance for checking the UI ("Verifying in the app" in the UI redesign
// plan). It never touches your library or your `pnpm dev` session:
//
// - a temporary profile with its own user-data folder and seeded fixture library;
// - the main process and preload built into that profile, not into out/;
// - a second renderer dev server (hot reload) with its own dependency cache;
// - Electron with a remote debugging port, so scripts/sandbox/measure.ts or Playwright's
//   `chromium.connectOverCDP` can attach.
//
// Usage: pnpm sandbox [--fixture rough|first-run] [--bulk <count>] [--built] [--port <cdp port>] [--keep]
//
// Ctrl+C closes Electron and the dev server and deletes the profile (unless --keep).
import { spawn, type ChildProcess } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { createServer, type ViteDevServer } from "vite-plus";
import electronViteConfig from "../../electron.vite.config";
import { stateFile } from "./paths";
import { seedLibrary } from "./seed";

const { values } = parseArgs({
  options: {
    built: { default: false, type: "boolean" },
    bulk: { default: "0", type: "string" },
    fixture: { default: "rough", type: "string" },
    keep: { default: false, type: "boolean" },
    port: { default: "9333", type: "string" },
  },
});

if (values.fixture !== "rough" && values.fixture !== "first-run") {
  throw new Error(`Unknown fixture "${values.fixture}". Use "rough" or "first-run".`);
}

// The shell this runs in may set ELECTRON_RUN_AS_NODE, which makes Electron start as plain Node.
const environment = Object.fromEntries(
  Object.entries(process.env).flatMap(([key, value]) =>
    key === "ELECTRON_RUN_AS_NODE" || value === undefined ? [] : [[key, value] as const],
  ),
);

const profile = await mkdtemp(join(tmpdir(), "lume-sandbox-"));

const userData = join(profile, "user-data");

const buildDirectory = join(profile, "build");

let devServer: ViteDevServer | null = null;

let electron: ChildProcess | null = null;

process.once("SIGINT", () => void shutdown());

process.once("SIGTERM", () => void shutdown());

try {
  console.log(`Profile: ${profile}`);

  if (values.fixture === "rough") {
    await seedLibrary(profile, Number(values.bulk));
    console.log("Seeded the rough-data library");
  }

  await buildApp();
  const rendererUrl = values.built ? null : await startRendererServer();
  electron = launchElectron(rendererUrl);

  const state = {
    cdpUrl: `http://127.0.0.1:${values.port}`,
    profile,
    rendererUrl,
    statesUrl: rendererUrl ? new URL("states.html", rendererUrl).toString() : null,
  };

  await writeFile(stateFile, JSON.stringify(state, null, 2));
  console.log(JSON.stringify(state, null, 2));
  console.log("Press Ctrl+C to stop and delete the profile.");
} catch (error) {
  console.error(error);
  await shutdown(1);
}

/** Outside Electron, the electron package exports the path to its binary. */
function electronPathOrThrow() {
  // SAFETY: in Node, `require("electron")` returns the binary's path (node_modules/electron/index.js).
  const path = createRequire(import.meta.url)("electron") as string;

  if (!path) throw new Error("The electron package did not resolve to a binary");

  return path;
}

/** Builds main, preload and renderer into the profile, leaving out/ to `pnpm dev`. */
function buildApp() {
  return new Promise<void>((resolve, reject) => {
    const build = spawn(
      "pnpm",
      ["exec", "electron-vite", "build", "--outDir", buildDirectory, "--logLevel", "warn"],
      { env: environment, stdio: "inherit" },
    );

    build.once("error", reject);
    build.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`electron-vite build exited with ${code}`)),
    );
  });
}

/**
 * `electron-vite dev --rendererOnly` also launches Electron with the default profile, so the
 * renderer server is started here from the same config instead.
 */
async function startRendererServer() {
  const config = electronViteConfig({ command: "serve", mode: "development" });

  if (!config.renderer) throw new Error("electron.vite.config.ts has no renderer config");

  devServer = await createServer({
    ...config.renderer,
    // A separate cache, so this server never re-optimizes the dependencies `pnpm dev` is serving.
    cacheDir: "node_modules/.vite-sandbox",
    clearScreen: false,
    configFile: false,
    logLevel: "warn",
    server: { port: 5190, strictPort: false },
  });
  await devServer.listen();

  const url = devServer.resolvedUrls?.local[0];

  if (!url) throw new Error("The renderer dev server has no local URL");

  return url;
}

function launchElectron(rendererUrl: string | null) {
  const child = spawn(
    electronPathOrThrow(),
    [
      join(buildDirectory, "main", "main.cjs"),
      `--user-data-dir=${userData}`,
      `--remote-debugging-port=${values.port}`,
    ],
    {
      env: rendererUrl ? { ...environment, ELECTRON_RENDERER_URL: rendererUrl } : environment,
      stdio: "inherit",
    },
  );

  child.once("exit", () => {
    electron = null;
    void shutdown();
  });

  return child;
}

async function shutdown(exitCode = 0) {
  const running = electron;
  electron = null;

  if (running && running.exitCode === null) {
    // Electron's helper processes write to the profile until the app has quit.
    const exited = new Promise((resolve) => running.once("exit", resolve));
    running.kill();
    await exited;
  }

  await devServer?.close();
  devServer = null;
  await rm(stateFile, { force: true });

  if (values.keep) console.log(`Kept ${profile}`);
  else await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 200 });

  process.exit(exitCode);
}
