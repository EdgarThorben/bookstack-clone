import { sql } from "drizzle-orm";
import { db } from "../db/client";

/**
 * Returns true if adding the directed edge
 * `itemId --relationshipType--> relatedItemId` would create a cycle —
 * i.e. `relatedItemId` can already (directly or transitively) reach
 * `itemId` via existing item_relationships rows.
 *
 * This is app-level, not a DB constraint, because Postgres check
 * constraints can't express "no path back to the origin" across an
 * arbitrary number of hops. See CLAUDE.md's data-model rules.
 */
export async function wouldCreateCycle(itemId: string, relatedItemId: string): Promise<boolean> {
  if (itemId === relatedItemId) return true;

  const result = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE reachable(id) AS (
      SELECT related_item_id AS id
      FROM item_relationships
      WHERE item_id = ${relatedItemId}
      UNION
      SELECT ir.related_item_id AS id
      FROM item_relationships ir
      JOIN reachable r ON ir.item_id = r.id
    )
    SELECT 1 AS id FROM reachable WHERE id = ${itemId} LIMIT 1
  `);

  return result.rows.length > 0;
}
