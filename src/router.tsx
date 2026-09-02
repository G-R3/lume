import {
  Navigate,
  createHashHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import App, { SourcesRoute, TracksRoute } from "./App";

const rootRoute = createRootRoute({
  component: App,
  notFoundComponent: () => <Navigate replace to="/tracks" />,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: () => <Navigate replace to="/tracks" />,
});

const tracksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tracks",
  component: TracksRoute,
});

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings/sources",
  component: SourcesRoute,
});

const routeTree = rootRoute.addChildren([indexRoute, tracksRoute, sourcesRoute]);

export function createAppRouter() {
  return createRouter({
    history: createHashHistory(),
    routeTree,
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
