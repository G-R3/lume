import { createFileRoute } from "@tanstack/react-router";
import { AppLayout } from "@/pages/layout";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
