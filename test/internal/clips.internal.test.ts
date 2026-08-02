import { describe, expect, it } from "bun:test";
import {
  normalizeClipTitle,
  validateClipRange
} from "@/features/clips/_shared/domain/validation";
import { detectRecordingFormat } from "@/features/recordings/format";
import { extendedRecordingBytes } from "@/test/e2e/fixtures/recording";

describe("clip validation", () => {
  it("accepts a half-open range ending at the final frame", () => {
    expect(() =>
      validateClipRange({ startTick: 10, endTick: 824, totalFrames: 824 })
    ).not.toThrow();
  });

  it("rejects empty, reversed, and out-of-bounds ranges", () => {
    expect(() =>
      validateClipRange({ startTick: 20, endTick: 20, totalFrames: 824 })
    ).toThrow("O fim do clipe precisa estar depois do início");
    expect(() =>
      validateClipRange({ startTick: 30, endTick: 20, totalFrames: 824 })
    ).toThrow("O fim do clipe precisa estar depois do início");
    expect(() =>
      validateClipRange({ startTick: 20, endTick: 825, totalFrames: 824 })
    ).toThrow("O fim do clipe ultrapassa a duração da gravação");
  });

  it("normalizes optional titles without storing whitespace", () => {
    expect(normalizeClipTitle("  Gol decisivo  ")).toBe("Gol decisivo");
    expect(normalizeClipTitle("   ")).toBeNull();
    expect(normalizeClipTitle(null)).toBeNull();
  });

  it("detects the HBRX footer independently of the filename", () => {
    expect(detectRecordingFormat(extendedRecordingBytes())).toBe("hbrx");
    expect(
      detectRecordingFormat(new Uint8Array([0x48, 0x42, 0x52, 0x32]))
    ).toBe("hbr2");
  });
});
