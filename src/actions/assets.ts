import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { assetRelationships, assetRevisions, assets, assetTypes, relationshipTypes } from "../db/schema";
import type { PageDetail } from "../db/schema";
import type { SessionUser } from "../lib/auth";
import { wouldCreateCycle } from "../lib/assetGraph";
import { getAssetBySlug } from "../lib/assetQueries";
import { diffDetails } from "../lib/diff";
import { slugify } from "../lib/slug";

function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to do that." });
  }
  return locals.user;
}

const fieldRowSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
});

function parseFields(raw: string): PageDetail[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ActionError({ code: "BAD_REQUEST", message: "Field rows were malformed." });
  }
  const result = z.array(fieldRowSchema).safeParse(parsed);
  if (!result.success) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Field rows were malformed." });
  }
  return result.data;
}

export const createAsset = defineAction({
  accept: "form",
  input: z.object({
    type: z.enum(assetTypes),
    name: z.string().min(1),
    fields: z.string().default("[]"),
  }),
  handler: async ({ type, name, fields }, context) => {
    const user = requireUser(context.locals);
    const parsedFields = parseFields(fields);

    const slugBase = slugify(name);
    let slug = slugBase;
    let suffix = 1;
    while (await getAssetBySlug(slug)) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const [assetRow] = await db
      .insert(assets)
      .values({
        type,
        slug,
        name,
        fields: parsedFields,
        createdBy: user.id,
        updatedBy: user.id,
        currentRevision: 1,
      })
      .returning();

    await db.insert(assetRevisions).values({
      assetId: assetRow.id,
      revisionNo: 1,
      authorId: user.id,
      summary: "Asset created.",
      fieldsSnapshot: parsedFields,
      changes: [],
    });

    return { slug };
  },
});

export const updateAsset = defineAction({
  accept: "form",
  input: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    fields: z.string().default("[]"),
    summary: z.string().optional(),
  }),
  handler: async ({ slug, name, fields, summary }, context) => {
    const user = requireUser(context.locals);
    const existing = await getAssetBySlug(slug);
    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Asset not found." });
    }

    const parsedFields = parseFields(fields);
    const changes = diffDetails(existing.fields, parsedFields);
    const nextRevision = existing.currentRevision + 1;

    await db
      .update(assets)
      .set({
        name,
        fields: parsedFields,
        updatedBy: user.id,
        updatedAt: new Date(),
        currentRevision: nextRevision,
      })
      .where(eq(assets.id, existing.id));

    await db.insert(assetRevisions).values({
      assetId: existing.id,
      revisionNo: nextRevision,
      authorId: user.id,
      summary:
        summary?.trim() || (changes.length > 0 ? "Updated asset fields." : "Edited asset (no field changes)."),
      fieldsSnapshot: parsedFields,
      changes,
    });

    return { slug };
  },
});

// Soft-delete per CLAUDE.md: mark decommissioned, never hard-delete, so
// relationship history and past revisions stay intact and auditable.
export const decommissionAsset = defineAction({
  accept: "form",
  input: z.object({ slug: z.string().min(1) }),
  handler: async ({ slug }, context) => {
    requireUser(context.locals);
    const existing = await getAssetBySlug(slug);
    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Asset not found." });
    }

    await db
      .update(assets)
      .set({ status: "decommissioned", decommissionedAt: new Date() })
      .where(eq(assets.id, existing.id));

    return { slug };
  },
});

export const addAssetRelationship = defineAction({
  accept: "form",
  input: z.object({
    assetSlug: z.string().min(1),
    relatedAssetSlug: z.string().min(1),
    relationshipType: z.enum(relationshipTypes),
  }),
  handler: async ({ assetSlug, relatedAssetSlug, relationshipType }, context) => {
    const user = requireUser(context.locals);
    const asset = await getAssetBySlug(assetSlug);
    const relatedAsset = await getAssetBySlug(relatedAssetSlug);
    if (!asset || !relatedAsset) {
      throw new ActionError({ code: "NOT_FOUND", message: "One or both assets were not found." });
    }
    if (asset.id === relatedAsset.id) {
      throw new ActionError({ code: "BAD_REQUEST", message: "An asset can't relate to itself." });
    }
    if (await wouldCreateCycle(asset.id, relatedAsset.id)) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: `That would create a circular dependency — ${relatedAsset.name} already (directly or indirectly) points back to ${asset.name}.`,
      });
    }

    await db.insert(assetRelationships).values({
      assetId: asset.id,
      relatedAssetId: relatedAsset.id,
      relationshipType,
      createdBy: user.id,
    });

    return { assetSlug, relatedAssetSlug };
  },
});
