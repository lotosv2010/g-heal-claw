import {
  index,
  integer,
  pgTable,
  timestamp,
  unique,
  varchar,
} from "drizzle-orm/pg-core";
import { projects } from "./projects.js";
import { releases } from "./releases.js";

/**
 * Release Artifacts（ADR-0031 §2.1）
 *
 * 存储 Sourcemap .map 文件的元数据，实际文件放 MinIO。
 * (release_id, filename) 唯一：同 release 同 JS 文件只保留最新 map。
 */
export const releaseArtifacts = pgTable(
  "release_artifacts",
  {
    id: varchar("id", { length: 32 }).primaryKey(), // art_xxx
    releaseId: varchar("release_id", { length: 32 })
      .notNull()
      .references(() => releases.id, { onDelete: "cascade" }),
    projectId: varchar("project_id", { length: 32 })
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    filename: varchar("filename", { length: 512 }).notNull(),
    mapFilename: varchar("map_filename", { length: 512 }).notNull(),
    storageKey: varchar("storage_key", { length: 1024 }).notNull(),
    fileSize: integer("file_size").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    unique("uq_artifacts_release_filename").on(t.releaseId, t.filename),
    index("idx_artifacts_project_release").on(t.projectId, t.releaseId),
  ],
);

export type ReleaseArtifactRow = typeof releaseArtifacts.$inferSelect;
export type NewReleaseArtifactRow = typeof releaseArtifacts.$inferInsert;
