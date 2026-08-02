import type { RecordingFormat } from "@/features/recordings/db";

const HBRX_FOOTER_LENGTH = 40;
const HBRX_SIGNATURE = new Uint8Array([
  0x48, 0x42, 0x52, 0x58, 0x0d, 0x0a, 0x1a, 0x0a
]);

export function detectRecordingFormat(bytes: Uint8Array): RecordingFormat {
  return hasHbrxFooter(bytes) ? "hbrx" : "hbr2";
}

export function readHbrxExtensionVersion(bytes: Uint8Array): number | null {
  if (!hasHbrxFooter(bytes)) {
    return null;
  }

  const footerOffset = bytes.length - HBRX_FOOTER_LENGTH;
  return new DataView(
    bytes.buffer,
    bytes.byteOffset + footerOffset,
    HBRX_FOOTER_LENGTH
  ).getUint16(8);
}

function hasHbrxFooter(bytes: Uint8Array): boolean {
  if (bytes.length < HBRX_FOOTER_LENGTH) {
    return false;
  }

  const signatureOffset = bytes.length - HBRX_FOOTER_LENGTH;
  return HBRX_SIGNATURE.every(
    (value, index) => bytes[signatureOffset + index] === value
  );
}
