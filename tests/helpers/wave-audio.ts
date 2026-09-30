// Mono PCM silence. Eight-bit samples are unsigned; sixteen-bit samples are signed.
export function createWaveAudio(duration = 1, bitsPerSample: 8 | 16 = 8) {
  const sampleRate = 8_000;
  const bytesPerSample = bitsPerSample / 8;
  const dataLength = sampleRate * duration * bytesPerSample;
  const bytes = new Uint8Array(44 + dataLength);
  const view = new DataView(bytes.buffer);

  bytes.set(new TextEncoder().encode("RIFF"), 0);
  view.setUint32(4, 36 + dataLength, true);
  bytes.set(new TextEncoder().encode("WAVEfmt "), 8);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, bitsPerSample, true);
  bytes.set(new TextEncoder().encode("data"), 36);
  view.setUint32(40, dataLength, true);

  if (bitsPerSample === 8) bytes.fill(128, 44);

  return bytes;
}
