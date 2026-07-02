import { replaceLiveRoomSnapshot } from "@/features/live-state/_shared/domain/registry";
import type { LiveRoomSnapshot } from "@/features/live-state/_shared/domain/protocol";

type ApplyLiveRoomSnapshotInput = {
  roomId: string;
  snapshot: LiveRoomSnapshot;
};

export function applyLiveRoomSnapshot(input: ApplyLiveRoomSnapshotInput): void {
  replaceLiveRoomSnapshot(input.roomId, input.snapshot);
}
