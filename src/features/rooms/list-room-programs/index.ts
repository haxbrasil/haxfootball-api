import { asc } from "drizzle-orm";
import { db } from "@/db/client";
import {
  listRoomProgramsResponseSchema,
  toRoomProgramResponse,
  type RoomProgramResponse
} from "@/features/rooms/room.contract";
import { roomPrograms } from "@/features/rooms/room.db";

export { listRoomProgramsResponseSchema };

export async function listRoomPrograms(): Promise<RoomProgramResponse[]> {
  const programs = await db
    .select()
    .from(roomPrograms)
    .orderBy(asc(roomPrograms.name));

  return programs.map(toRoomProgramResponse);
}
