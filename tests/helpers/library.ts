import { getSources } from "../../electron/library";

export function getActiveSource(sourceId: number) {
  const source = getSources().find((candidate) => candidate.id === sourceId);

  if (!source) throw new Error(`Library source ${sourceId} is not active`);

  return source;
}
