import { tmpdir } from "node:os";
import { join } from "node:path";

/** Written by start.ts while the sandbox runs; read by measure.ts. */
export const stateFile = join(tmpdir(), "lume-sandbox.json");
