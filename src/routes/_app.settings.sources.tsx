import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/settings/sources")({
  beforeLoad: () => {
    throw redirect({ replace: true, to: "/settings" });
  },
});
