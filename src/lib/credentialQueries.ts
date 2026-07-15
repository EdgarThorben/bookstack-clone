import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { credentialReveals, credentials, users } from "../db/schema";

export async function getCredentialsForItem(itemId: string) {
  const rows = await db
    .select({
      id: credentials.id,
      label: credentials.label,
      username: credentials.username,
      createdAt: credentials.createdAt,
      createdByName: users.displayName,
    })
    .from(credentials)
    .leftJoin(users, eq(credentials.createdBy, users.id))
    .where(eq(credentials.itemId, itemId))
    .orderBy(credentials.label);

  const withRevealCounts = await Promise.all(
    rows.map(async (row) => {
      const reveals = await db
        .select({ id: credentialReveals.id })
        .from(credentialReveals)
        .where(eq(credentialReveals.credentialId, row.id));
      return {
        ...row,
        createdByName: row.createdByName ?? "Unknown",
        revealCount: reveals.length,
      };
    }),
  );

  return withRevealCounts;
}

export async function getCredentialById(id: string) {
  const [row] = await db.select().from(credentials).where(eq(credentials.id, id)).limit(1);
  return row ?? null;
}
