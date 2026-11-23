export const PLAYLIST_TITLE_MAX_LENGTH = 100;

export const PLAYLIST_DESCRIPTION_MAX_LENGTH = 300;

export function normalizePlaylistText(text: { description: string | null; title: string }) {
  return {
    description: text.description?.trim() || null,
    title: text.title.trim(),
  };
}
