import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { eq, sql } from "drizzle-orm";
import { db } from "../db/client";
import { books, pageRevisions, pages } from "../db/schema";
import type { PageDetail } from "../db/schema";
import { requireUser } from "../lib/auth";
import { diffDetails } from "../lib/diff";
import { getItDepartmentNav, getPageBySlug } from "../lib/queries";
import { slugify } from "../lib/slug";

const detailRowSchema = z.object({
  category: z.string().min(1),
  label: z.string().min(1),
  value: z.string().min(1),
});

function parseDetails(raw: string): PageDetail[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ActionError({ code: "BAD_REQUEST", message: "Detail rows were malformed." });
  }
  const result = z.array(detailRowSchema).safeParse(parsed);
  if (!result.success || result.data.length === 0) {
    throw new ActionError({ code: "BAD_REQUEST", message: "Add at least one valid detail field." });
  }
  return result.data;
}

export const createPage = defineAction({
  accept: "form",
  input: z.object({
    title: z.string().min(1),
    chapter: z.enum(["server-systems", "other"]),
    region: z.string().optional(),
    imageUrl: z.string().optional(),
    warning: z.string().optional(),
    details: z.string(),
  }),
  handler: async ({ title, chapter, region, imageUrl, warning, details }, context) => {
    const user = requireUser(context.locals);
    const parsedDetails = parseDetails(details);

    const nav = await getItDepartmentNav();
    const slugBase = slugify(title);
    let slug = slugBase;
    let suffix = 1;
    while (await getPageBySlug(slug)) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const [pageRow] = await db
      .insert(pages)
      .values({
        bookId: nav.book.id,
        chapterId: chapter === "server-systems" && nav.chapter ? nav.chapter.id : null,
        slug,
        title,
        region: region?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        warning: warning?.trim() || null,
        details: parsedDetails,
        createdBy: user.id,
        updatedBy: user.id,
        currentRevision: 1,
      })
      .returning();

    await db.insert(pageRevisions).values({
      pageId: pageRow.id,
      revisionNo: 1,
      authorId: user.id,
      summary: "Initial page created.",
      detailsSnapshot: parsedDetails,
      changes: [],
    });

    await db
      .update(books)
      .set({ pageCount: sql`${books.pageCount} + 1` })
      .where(eq(books.id, nav.book.id));

    return { slug };
  },
});

export const updatePage = defineAction({
  accept: "form",
  input: z.object({
    slug: z.string().min(1),
    title: z.string().min(1),
    region: z.string().optional(),
    imageUrl: z.string().optional(),
    warning: z.string().optional(),
    details: z.string(),
    summary: z.string().optional(),
  }),
  handler: async ({ slug, title, region, imageUrl, warning, details, summary }, context) => {
    const user = requireUser(context.locals);
    const existing = await getPageBySlug(slug);
    if (!existing) {
      throw new ActionError({ code: "NOT_FOUND", message: "Page not found." });
    }

    const parsedDetails = parseDetails(details);
    const changes = diffDetails(existing.details, parsedDetails);
    const nextRevision = existing.currentRevision + 1;

    await db
      .update(pages)
      .set({
        title,
        region: region?.trim() || null,
        imageUrl: imageUrl?.trim() || null,
        warning: warning?.trim() || null,
        details: parsedDetails,
        updatedBy: user.id,
        updatedAt: new Date(),
        currentRevision: nextRevision,
      })
      .where(eq(pages.id, existing.id));

    await db.insert(pageRevisions).values({
      pageId: existing.id,
      revisionNo: nextRevision,
      authorId: user.id,
      summary: summary?.trim() || (changes.length > 0 ? "Updated page details." : "Edited page (no field changes)."),
      detailsSnapshot: parsedDetails,
      changes,
    });

    return { slug };
  },
});
