import { readFileSync } from "node:fs";

export function recordingFile(): File {
  return new File([recordingBuffer()], "match.hbr2");
}

export function recordingBytes(): Uint8Array {
  return readFileSync("test/e2e/fixtures/assets/recording.hbr2");
}

function recordingBuffer(): ArrayBuffer {
  const bytes = recordingBytes();
  const buffer = new ArrayBuffer(bytes.byteLength);
  const view = new Uint8Array(buffer);

  view.set(bytes);

  return buffer;
}
