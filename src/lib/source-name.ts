export function getSourceName(path: string) {
  return path.split(/[/\\]/).filter(Boolean).at(-1) ?? path;
}
