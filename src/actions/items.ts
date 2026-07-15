import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { itemRelationships, itemRevisions, items, itemTypes, relationshipTypes, collections } from "../db/schema";
import type { PageDetail } from "../db/schema";
import type { SessionUser } from "../lib/auth";
import { wouldCreateCycle } from "../lib/itemGraph";
import { getItemBySlug } from "../lib/itemQueries";
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

export const createItem = defineAction({
  accept: "form",
  input: z.object({
    type: z.enum(itemTypes),
    name: z.string().min(1),
    collectionSlug: z.string().min(1),
    section: z.string().optional(),
    region: z.string().optional(),
    imageUrl: z.string().optional(),
    warning: z.string().optional(),
    fields: z.string().default("[]"),
  }),
  handler: async ({ type, name, collectionSlug, section, region, imageUrl, warning, fields }, context) => {
    const user = requireUser(context.locals);
    const parsedFields = parseFields(fields);

    const [collection] = await db.select().from(collections).where(eq(collections.slug, collectionSlug)).limit(1);
    if (!collection) {
      throw new ActionError({ code: "NOT_FOUND", message: "Collection not found." });
    }

    const slugBase = slugify(name);
    let slug = slugBase;
    let suffix = 1;
    while (await getItemBySlug(slug)) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const [itemRow] = await db
      .insert(items)
      .values({
        type,
        collectionId: collection.id,
        section: section?.trim() || null,
        slug,
        name,
        region: region?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        warning: warning?.trim() || null,
        fields: parsedFields,
        createdBy: user.id,
        updatedBy: user.id,
        currentRevision: 1,
      })
      .returning();

    await db.insert(itemRevisions).values({
      itemId: itemRow.id,
      revisionNo: 1,
      authorId: user.id,
      summary: "Item created.",
      fieldsSnapshot: parsedFields,
      changes: [],
    });

    return { slug };
  },
});

export const updateItem = defineAction({
  accept: "form",
  input: z.object({
    slug: z.string().min(1),
    name: z.string().min(1),
    region: z.string().optional(),
    imageUrl: z.string().optional(),
    warning: z.string().optional(),
    fields: z.string().default("[]"),
    summary: z.string().optional(),
  }),
  handler: async ({ slug, name, region, imageUrl, warning, fields, summary }, context) => {
    const user = requireUser(context.locals);
    const existing = await getItemBySlug(slug);
    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Item not found." });
    }

    const parsedFields = parseFields(fields);
    const changes = diffDetails(existing.fields, parsedFields);
    const nextRevision = existing.currentRevision + 1;

    await db
      .update(items)
      .set({
        name,
        region: region?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        warning: warning?.trim() || null,
        fields: parsedFields,
        updatedBy: user.id,
        updatedAt: new Date(),
        currentRevision: nextRevision,
      })
      .where(eq(items.id, existing.id));

    await db.insert(itemRevisions).values({
      itemId: existing.id,
      revisionNo: nextRevision,
      authorId: user.id,
      summary:
        summary?.trim() || (changes.length > 0 ? "Updated item fields." : "Edited item (no field changes)."),
      fieldsSnapshot: parsedFields,
      changes,
    });

    return { slug };
  },
});

// Soft-delete per CLAUDE.md: mark archived, never hard-delete, so
// relationship history and past revisions stay intact and auditable.
export const archiveItem = defineAction({
  accept: "form",
  input: z.object({ slug: z.string().min(1) }),
  handler: async ({ slug }, context) => {
    requireUser(context.locals);
    const existing = await getItemBySlug(slug);
    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Item not found." });
    }

    await db
      .update(items)
      .set({ status: "archived", archivedAt: new Date() })
      .where(eq(items.id, existing.id));

    return { slug };
  },
});

export const addItemRelationship = defineAction({
  accept: "form",
  input: z.object({
    itemSlug: z.string().min(1),
    relatedItemSlug: z.string().min(1),
    relationshipType: z.enum(relationshipTypes),
  }),
  handler: async ({ itemSlug, relatedItemSlug, relationshipType }, context) => {
    const user = requireUser(context.locals);
    const item = await getItemBySlug(itemSlug);
    const relatedItem = await getItemBySlug(relatedItemSlug);
    if (!item || !relatedItem) {
      throw new ActionError({ code: "NOT_FOUND", message: "One or both items were not found." });
    }
    if (item.id === relatedItem.id) {
      throw new ActionError({ code: "BAD_REQUEST", message: "An item can't relate to itself." });
    }
    if (await wouldCreateCycle(item.id, relatedItem.id)) {
      throw new ActionError({
        code: "BAD_REQUEST",
        message: `That would create a circular dependency — ${relatedItem.name} already (directly or indirectly) points back to ${item.name}.`,
      });
    }

    await db.insert(itemRelationships).values({
      itemId: item.id,
      relatedItemId: relatedItem.id,
      relationshipType,
      createdBy: user.id,
    });

    return { itemSlug, relatedItemSlug };
  },
});
