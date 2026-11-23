export const AUDIO_FORMATS = [
  { label: "FLAC", contentType: "audio/flac", extensions: [".flac"] },
  { label: "M4A", contentType: "audio/mp4", extensions: [".m4a"] },
  { label: "MP3", contentType: "audio/mpeg", extensions: [".mp3"] },
  { label: "AAC", contentType: "audio/aac", extensions: [".aac"] },
  { label: "OGG", contentType: "audio/ogg", extensions: [".ogg", ".oga"] },
  { label: "OPUS", contentType: "audio/ogg", extensions: [".opus"] },
  { label: "WAV", contentType: "audio/wav", extensions: [".wav"] },
] as const;
