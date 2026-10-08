// Development-only entry for the states page (states.html). It renders the app's components with
// fixture data at actual size, measures them, and compares the numbers with Paper. The production
// build never includes it: electron.vite.config.ts builds index.html only.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import "../index.css";
import { StatesPage } from "@/states/states-page";

// Outside Electron there is no preload API, but components read it while rendering (TrackList's
// mutations reference window.lume methods). Every call rejects, since specimens never need data.
if (!Object.hasOwn(window, "lume")) {
  const unavailable = () => Promise.reject(new Error("The states page has no Lume API"));

  // SAFETY: the proxy answers every LumeApi method with a rejecting function and `isMac` with a
  // boolean, which is all a component can read from it.
  window.lume = new Proxy({} as Window["lume"], {
    get: (_target, property) =>
      property === "isMac" ? navigator.userAgent.includes("Mac") : unavailable,
  });
}

const router = createRouter({
  history: createMemoryHistory({ initialEntries: ["/"] }),
  routeTree: createRootRoute({ component: StatesPage }),
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={new QueryClient()}>
      <MotionConfig reducedMotion="user">
        <RouterProvider router={router} />
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
