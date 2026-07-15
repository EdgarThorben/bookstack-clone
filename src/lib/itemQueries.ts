import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { collections, itemRelationships, itemRevisions, items, users, type ItemType } from "../db/schema";

const createdByUser = alias(users, "created_by_user");
const updatedByUser = alias(users, "updated_by_user");

export async function getCollections() {
  const [collectionRows, itemRows] = await Promise.all([
    db.select().from(collections).orderBy(collections.sortOrder),
    db
      .select({ slug: items.slug, name: items.name, type: items.type, collectionId: items.collectionId })
      .from(items)
      .where(eq(items.status, "active")),
  ]);
  return collectionRows.map((c) => ({
    ...c,
    items: itemRows.filter((i) => i.collectionId === c.id),
  }));
}

export async function getCollectionBySlug(slug: string) {
  const [collection] = await db.select().from(collections).where(eq(collections.slug, slug)).limit(1);
  if (!collection) return null;
  const collectionItems = await db
    .select({
      slug: items.slug,
      name: items.name,
      type: items.type,
      section: items.section,
      region: items.region,
      imageUrl: items.imageUrl,
      status: items.status,
    })
    .from(items)
    .where(eq(items.collectionId, collection.id));
  return { ...collection, items: collectionItems };
}

export async function listItems(opts?: { type?: ItemType }) {
  const rows = await db
    .select({
      item: items,
      collectionTitle: collections.title,
      collectionSlug: collections.slug,
    })
    .from(items)
    .innerJoin(collections, eq(items.collectionId, collections.id));
  const filtered = opts?.type ? rows.filter((r) => r.item.type === opts.type) : rows;
  return filtered
    .map((r) => ({ ...r.item, collectionTitle: r.collectionTitle, collectionSlug: r.collectionSlug }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getItemBySlug(slug: string) {
  const [row] = await db
    .select({
      item: items,
      collectionTitle: collections.title,
      collectionSlug: collections.slug,
      createdByName: createdByUser.displayName,
      updatedByName: updatedByUser.displayName,
    })
    .from(items)
    .innerJoin(collections, eq(items.collectionId, collections.id))
    .leftJoin(createdByUser, eq(items.createdBy, createdByUser.id))
    .leftJoin(updatedByUser, eq(items.updatedBy, updatedByUser.id))
    .where(eq(items.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    ...row.item,
    collectionTitle: row.collectionTitle,
    collectionSlug: row.collectionSlug,
    createdByName: row.createdByName ?? "Unknown",
    updatedByName: row.updatedByName ?? "Unknown",
  };
}

export async function getItemRevisions(slug: string) {
  const item = await getItemBySlug(slug);
  if (!item) return null;
  const revisions = await db
    .select({
      revisionNo: itemRevisions.revisionNo,
      summary: itemRevisions.summary,
      changes: itemRevisions.changes,
      createdAt: itemRevisions.createdAt,
      authorName: users.displayName,
    })
    .from(itemRevisions)
    .leftJoin(users, eq(itemRevisions.authorId, users.id))
    .where(eq(itemRevisions.itemId, item.id))
    .orderBy(desc(itemRevisions.revisionNo));
  return { title: item.name, revisions };
}

// Relationships are directed (itemId -> relatedItemId), so a given item can
// appear on either side. Returning both keeps "what does this depend on" and
// "what depends on this" separate instead of one ambiguous list.
export async function getItemRelationships(itemId: string) {
  const outgoingItem = alias(items, "outgoing_related_item");
  const incomingItem = alias(items, "incoming_source_item");

  const outgoing = await db
    .select({
      relationshipType: itemRelationships.relationshipType,
      relatedItem: outgoingItem,
    })
    .from(itemRelationships)
    .innerJoin(outgoingItem, eq(itemRelationships.relatedItemId, outgoingItem.id))
    .where(eq(itemRelationships.itemId, itemId));

  const incoming = await db
    .select({
      relationshipType: itemRelationships.relationshipType,
      sourceItem: incomingItem,
    })
    .from(itemRelationships)
    .innerJoin(incomingItem, eq(itemRelationships.itemId, incomingItem.id))
    .where(eq(itemRelationships.relatedItemId, itemId));

  return { outgoing, incoming };
}

export interface SearchEntry {
  title: string;
  url: string;
  type: string;
  excerpt: string;
}

export async function getSearchEntries(): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = [
    { title: "Home", url: "/", type: "Home", excerpt: "NimbusVault Knowledge Base overview" },
    { title: "All Items", url: "/items", type: "Items", excerpt: "Every documented system, service, and record" },
  ];

  const collectionList = await getCollections();
  for (const collection of collectionList) {
    entries.push({
      title: collection.title,
      url: `/collections/${collection.slug}`,
      type: "Collection",
      excerpt: collection.description,
    });
  }

  const allItems = await listItems();
  for (const item of allItems) {
    entries.push({
      title: item.name,
      url: `/items/${item.slug}`,
      type: "Item",
      excerpt: item.region ? `${item.region} — ${item.collectionTitle}` : item.collectionTitle,
    });
  }

  return entries;
}
