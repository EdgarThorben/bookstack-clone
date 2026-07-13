import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("users_email_idx").on(table.email),
]);

export const sessions = pgTable("sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shelves = pgTable("shelves", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
}, (table) => [
  uniqueIndex("shelves_slug_idx").on(table.slug),
]);

export const books = pgTable("books", {
  id: uuid("id").defaultRandom().primaryKey(),
  shelfId: uuid("shelf_id").notNull().references(() => shelves.id, { onDelete: "cascade" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  pageCount: integer("page_count").notNull().default(0),
}, (table) => [
  uniqueIndex("books_slug_idx").on(table.slug),
]);

export const chapters = pgTable("chapters", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
});

export interface PageDetail {
  category: string;
  label: string;
  value: string;
}

export interface RevisionChange {
  field: string;
  from: string;
  to: string;
}

export const pages = pgTable("pages", {
  id: uuid("id").defaultRandom().primaryKey(),
  bookId: uuid("book_id").notNull().references(() => books.id, { onDelete: "cascade" }),
  chapterId: uuid("chapter_id").references(() => chapters.id, { onDelete: "set null" }),
  slug: text("slug").notNull(),
  title: text("title").notNull(),
  region: text("region"),
  imageUrl: text("image_url"),
  warning: text("warning"),
  details: jsonb("details").$type<PageDetail[]>().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  currentRevision: integer("current_revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("pages_slug_idx").on(table.slug),
]);

export const pageRevisions = pgTable("page_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id").notNull().references(() => pages.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  authorId: uuid("author_id").references(() => users.id),
  summary: text("summary").notNull(),
  detailsSnapshot: jsonb("details_snapshot").$type<PageDetail[]>().notNull().default([]),
  changes: jsonb("changes").$type<RevisionChange[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// --- CMDB: typed assets + relationship graph ---
// Distinct from `pages` (free-text wiki docs). An asset is a typed Configuration
// Item (server, switch, license, workstation, ...) with structured fields and
// its own revision history, per CLAUDE.md's data-model rules.

export const assetTypes = [
  "server",
  "storage-disk",
  "database",
  "application",
  "workstation",
  "network-device",
  "software-license",
  "service",
  "other",
] as const;
export type AssetType = (typeof assetTypes)[number];

export const assetStatuses = ["active", "decommissioned"] as const;
export type AssetStatus = (typeof assetStatuses)[number];

// Relationship is directed: assetId --[relationshipType]--> relatedAssetId
// e.g. (web-01, "depends_on", switch-core-1)
export const relationshipTypes = [
  "depends_on",
  "hosts",
  "connects_to",
  "runs_on",
  "licensed_for",
  "attached_to",
  "installed_on",
] as const;
export type RelationshipType = (typeof relationshipTypes)[number];

export const assets = pgTable("assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  type: text("type").notNull().$type<AssetType>(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  // Soft-delete per CLAUDE.md: decommissioned assets stay auditable, never hard-deleted.
  status: text("status").notNull().default("active").$type<AssetStatus>(),
  decommissionedAt: timestamp("decommissioned_at", { withTimezone: true }),
  fields: jsonb("fields").$type<PageDetail[]>().notNull().default([]),
  createdBy: uuid("created_by").references(() => users.id),
  updatedBy: uuid("updated_by").references(() => users.id),
  currentRevision: integer("current_revision").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("assets_slug_idx").on(table.slug),
]);

// Same revision pattern as pageRevisions — reused per CLAUDE.md, not a second mechanism.
export const assetRevisions = pgTable("asset_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  revisionNo: integer("revision_no").notNull(),
  authorId: uuid("author_id").references(() => users.id),
  summary: text("summary").notNull(),
  fieldsSnapshot: jsonb("fields_snapshot").$type<PageDetail[]>().notNull().default([]),
  changes: jsonb("changes").$type<RevisionChange[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// The CI relationship graph — an explicit join table, not prose links inside `fields`.
// DB-level guards: no self-references, no duplicate edges. Cycle detection across
// longer chains (A depends_on B depends_on C depends_on A) is enforced in
// src/lib/assetGraph.ts at write time, since Postgres check constraints can't
// express "no path back to the origin" across arbitrary depth.
export const assetRelationships = pgTable("asset_relationships", {
  id: uuid("id").defaultRandom().primaryKey(),
  assetId: uuid("asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  relatedAssetId: uuid("related_asset_id").notNull().references(() => assets.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull().$type<RelationshipType>(),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("asset_relationships_unique_idx").on(
    table.assetId,
    table.relatedAssetId,
    table.relationshipType,
  ),
  check("asset_relationships_no_self_reference", sql`${table.assetId} <> ${table.relatedAssetId}`),
]);
