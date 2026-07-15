import { ActionError, defineAction } from "astro:actions";
import { z } from "astro:schema";
import { db } from "../db/client";
import { collections } from "../db/schema";
import type { SessionUser } from "../lib/auth";
import { getCollectionBySlug } from "../lib/itemQueries";
import { slugify } from "../lib/slug";

function requireUser(locals: App.Locals): SessionUser {
  if (!locals.user) {
    throw new ActionError({ code: "UNAUTHORIZED", message: "You must be logged in to do that." });
  }
  return locals.user;
}

export const createCollection = defineAction({
  accept: "form",
  input: z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    imageUrl: z.string().min(1),
    category: z.enum(["Clients", "Internal"]),
  }),
  handler: async ({ title, description, imageUrl, category }, context) => {
    requireUser(context.locals);

    const slugBase = slugify(title);
    let slug = slugBase;
    let suffix = 1;
    while (await getCollectionBySlug(slug)) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    await db.insert(collections).values({
      slug,
      title,
      description,
      imageUrl,
      category,
    });

    return { slug };
  },
});
