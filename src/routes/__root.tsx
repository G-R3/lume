import { Navigate, createRootRoute } from "@tanstack/react-router";
import { AppRoot } from "@/App";

export const Route = createRootRoute({
  component: AppRoot,
  notFoundComponent: () => <Navigate replace to="/" />,
});
