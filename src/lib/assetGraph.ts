import { sql } from "drizzle-orm";
import { db } from "../db/client";

/**
 * Returns true if adding the directed edge
 * `assetId --relationshipType--> relatedAssetId` would create a cycle —
 * i.e. `relatedAssetId` can already (directly or transitively) reach
 * `assetId` via existing asset_relationships rows.
 *
 * This is app-level, not a DB constraint, because Postgres check
 * constraints can't express "no path back to the origin" across an
 * arbitrary number of hops. See CLAUDE.md's data-model rules.
 */
export async function wouldCreateCycle(assetId: string, relatedAssetId: string): Promise<boolean> {
  if (assetId === relatedAssetId) return true;

  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE reachable(id) AS (
      SELECT related_asset_id AS id
      FROM asset_relationships
      WHERE asset_id = ${relatedAssetId}
      UNION
      SELECT ar.related_asset_id AS id
      FROM asset_relationships ar
      JOIN reachable r ON ar.asset_id = r.id
    )
    SELECT 1 AS id FROM reachable WHERE id = ${assetId} LIMIT 1
  `);

  return result.rows.length > 0;
}
