// Development-only entry for the motion lab (motion-lab.html): Paper boards 20–23 running live on
// a copy of the header player, with every concept switchable. The production build never includes
// it: electron.vite.config.ts builds index.html only.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../index.css";
import { MotionLab } from "@/motion-lab/motion-lab";

if (!Object.hasOwn(window, "lume")) {
  // SAFETY: shared components only read `isMac` while rendering; the lab never calls the API.
  window.lume = new Proxy({} as Window["lume"], {
    get: (_target, property) =>
      property === "isMac"
        ? navigator.userAgent.includes("Mac")
        : () => Promise.reject(new Error("The motion lab has no Lume API")),
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <MotionLab />
  </StrictMode>,
);
