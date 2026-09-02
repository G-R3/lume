import { queryOptions } from "@tanstack/react-query";

export const libraryQuery = queryOptions({
  networkMode: "always",
  queryKey: ["library"],
  queryFn: () => window.lume.loadLibrary(),
  retry: false,
  staleTime: Infinity,
});
