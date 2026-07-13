import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { assetRelationships, assetRevisions, assets, users } from "../db/schema";

const createdByUser = alias(users, "asset_created_by_user");
const updatedByUser = alias(users, "asset_updated_by_user");

export async function listAssets() {
  return db.select().from(assets).orderBy(assets.name);
}

export async function getAssetBySlug(slug: string) {
  const [row] = await db
    .select({
      asset: assets,
      createdByName: createdByUser.displayName,
      updatedByName: updatedByUser.displayName,
    })
    .from(assets)
    .leftJoin(createdByUser, eq(assets.createdBy, createdByUser.id))
    .leftJoin(updatedByUser, eq(assets.updatedBy, updatedByUser.id))
    .where(eq(assets.slug, slug))
    .limit(1);
  if (!row) return null;
  return {
    ...row.asset,
    createdByName: row.createdByName ?? "Unknown",
    updatedByName: row.updatedByName ?? "Unknown",
  };
}

export async function getAssetRevisions(assetId: string) {
  return db
    .select({
      revisionNo: assetRevisions.revisionNo,
      summary: assetRevisions.summary,
      changes: assetRevisions.changes,
      createdAt: assetRevisions.createdAt,
      authorName: users.displayName,
    })
    .from(assetRevisions)
    .leftJoin(users, eq(assetRevisions.authorId, users.id))
    .where(eq(assetRevisions.assetId, assetId))
    .orderBy(desc(assetRevisions.revisionNo));
}

// Relationships are directed (assetId -> relatedAssetId), so a given asset can
// appear on either side. Returning both keeps "what does this depend on" and
// "what depends on this" separate instead of one ambiguous list.
export async function getAssetRelationships(assetId: string) {
  const outgoingAsset = alias(assets, "outgoing_related_asset");
  const incomingAsset = alias(assets, "incoming_source_asset");

  const outgoing = await db
    .select({
      relationshipType: assetRelationships.relationshipType,
      relatedAsset: outgoingAsset,
    })
    .from(assetRelationships)
    .innerJoin(outgoingAsset, eq(assetRelationships.relatedAssetId, outgoingAsset.id))
    .where(eq(assetRelationships.assetId, assetId));

  const incoming = await db
    .select({
      relationshipType: assetRelationships.relationshipType,
      sourceAsset: incomingAsset,
    })
    .from(assetRelationships)
    .innerJoin(incomingAsset, eq(assetRelationships.assetId, incomingAsset.id))
    .where(eq(assetRelationships.relatedAssetId, assetId));

  return { outgoing, incoming };
}
