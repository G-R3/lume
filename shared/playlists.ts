export const playlistTitleMaxLength = 100;

export const playlistDescriptionMaxLength = 300;

export function normalizePlaylistText(text: { description: string | null; title: string }) {
  return {
    description: text.description?.trim() || null,
    title: text.title.trim(),
  };
}
