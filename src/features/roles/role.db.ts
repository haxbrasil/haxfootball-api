import {
  integer,
  sqliteTable,
  text,
  uniqueIndex
} from "drizzle-orm/sqlite-core";
import { permissions } from "@/features/permissions/permission.db";

export const defaultRoleId = 1;
export const defaultRoleName = "default";
export const defaultRoleTitle = "Default";

export const roles = sqliteTable("roles", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  uuid: text("uuid")
    .notNull()
    .unique()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull().unique(),
  title: text("title").notNull(),
  bypassAllPermissions: integer("bypass_all_permissions", { mode: "boolean" })
    .notNull()
    .default(false),
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString())
});

export const rolePermissions = sqliteTable(
  "role_permissions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    roleId: integer("role_id")
      .notNull()
      .references(() => roles.id),
    permissionId: integer("permission_id")
      .notNull()
      .references(() => permissions.id),
    createdAt: text("created_at")
      .notNull()
      .$defaultFn(() => new Date().toISOString())
  },
  (table) => [
    uniqueIndex("role_permissions_role_id_permission_id_unique").on(
      table.roleId,
      table.permissionId
    )
  ]
);

export type Role = typeof roles.$inferSelect;
export type RolePermission = typeof rolePermissions.$inferSelect;
