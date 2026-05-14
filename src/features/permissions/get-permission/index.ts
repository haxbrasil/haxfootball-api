import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import {
  type PermissionResponse,
  toPermissionResponse
} from "@/features/permissions/permission.contract";
import { permissions } from "@/features/permissions/permission.db";
import { notFound } from "@/shared/http/errors";

export async function getPermission(uuid: string): Promise<PermissionResponse> {
  const [permission] = await db
    .select()
    .from(permissions)
    .where(eq(permissions.uuid, uuid));

  if (!permission) {
    throw notFound("Permission not found");
  }

  return toPermissionResponse(permission);
}
