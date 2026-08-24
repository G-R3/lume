import type { LumeApi } from "../shared/lib";

declare global {
  interface Window {
    lume: LumeApi;
  }
}

export {};
