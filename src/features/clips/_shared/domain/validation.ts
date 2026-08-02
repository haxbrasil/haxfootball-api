import { badRequest } from "@/shared/http/errors";

export function validateClipRange({
  startTick,
  endTick,
  totalFrames
}: {
  startTick: number;
  endTick: number;
  totalFrames: number;
}): void {
  if (!Number.isSafeInteger(startTick) || startTick < 0) {
    throw badRequest("O início do clipe precisa ser um tick válido");
  }
  if (!Number.isSafeInteger(endTick) || endTick <= startTick) {
    throw badRequest("O fim do clipe precisa estar depois do início");
  }
  if (endTick > totalFrames) {
    throw badRequest("O fim do clipe ultrapassa a duração da gravação");
  }
}

export function normalizeClipTitle(
  title: string | null | undefined
): string | null {
  const normalized = title?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}
