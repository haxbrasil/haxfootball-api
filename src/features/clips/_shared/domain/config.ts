import { env } from "@/config/env";

export const CLIP_FRAME_RATE = 60;

export type ClipConfiguration = {
  maxDurationSeconds: number;
  maxDurationFrames: number;
};

export function getClipConfiguration(): ClipConfiguration {
  const maxDurationSeconds = env.clipMaxDurationSeconds;

  return {
    maxDurationSeconds,
    maxDurationFrames: maxDurationSeconds * CLIP_FRAME_RATE
  };
}
