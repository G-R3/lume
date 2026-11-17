import type { LumeApi } from "../shared/ipc";

declare global {
  interface Window {
    lume: LumeApi;
  }
}

export {};
