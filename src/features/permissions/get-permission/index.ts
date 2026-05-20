import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import type { PermissionResponse } from "@/features/permissions/_shared/http/responses";
import { toPermissionResponse } from "@/features/permissions/_shared/http/responses";
import { permissions } from "@/features/permissions/db";
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
