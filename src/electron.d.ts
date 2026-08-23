import type { LumeApi } from "../shared/lib.ts";

declare global {
  interface Window {
    lume: LumeApi;
  }
}

export {};
