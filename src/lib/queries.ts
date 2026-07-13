import { desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "../db/client";
import { assets, books, chapters, pageRevisions, pages, shelves, users } from "../db/schema";

const createdByUser = alias(users, "created_by_user");
const updatedByUser = alias(users, "updated_by_user");

export async function getShelves() {
  const [shelfRows, bookRows] = await Promise.all([
    db.select().from(shelves),
    db.select().from(books),
  ]);
  return shelfRows.map((s) => ({
    ...s,
    books: bookRows.filter((b) => b.shelfId === s.id),
  }));
}

export async function getShelfBySlug(slug: string) {
  const [shelf] = await db.select().from(shelves).where(eq(shelves.slug, slug)).limit(1);
  if (!shelf) return null;
  const shelfBooks = await db.select().from(books).where(eq(books.shelfId, shelf.id));
  return { ...shelf, books: shelfBooks };
}

export async function getAllBooksWithShelf() {
  const rows = await db
    .select({ book: books, shelfTitle: shelves.title, shelfSlug: shelves.slug })
    .from(books)
    .innerJoin(shelves, eq(books.shelfId, shelves.id));
  return rows.map((r) => ({ ...r.book, shelfTitle: r.shelfTitle, shelfSlug: r.shelfSlug }));
}

export async function getBookWithShelfBySlug(slug: string) {
  const [row] = await db
    .select({ book: books, shelf: shelves })
    .from(books)
    .innerJoin(shelves, eq(books.shelfId, shelves.id))
    .where(eq(books.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function getBookNav(bookSlug: string) {
  const result = await getBookWithShelfBySlug(bookSlug);
  if (!result) throw new Error(`Book "${bookSlug}" is missing — did you run \`npm run db:seed\`?`);
  const { book, shelf } = result;
  const [chapter] = await db.select().from(chapters).where(eq(chapters.bookId, book.id)).limit(1);
  const allPages = await db
    .select({ slug: pages.slug, title: pages.title, chapterId: pages.chapterId, region: pages.region, imageUrl: pages.imageUrl })
    .from(pages)
    .where(eq(pages.bookId, book.id));
  const chapterPages = allPages.filter((p) => chapter && p.chapterId === chapter.id);
  const otherPages = allPages.filter((p) => !chapter || p.chapterId !== chapter.id);
  return { book, shelf, chapter, chapterPages, otherPages };
}

export function getItDepartmentNav() {
  return getBookNav("it-department");
}

export async function getPageBySlug(slug: string) {
  const [row] = await db
    .select({
      page: pages,
      createdByName: createdByUser.displayName,
      updatedByName: updatedByUser.displayName,
    })
    .from(pages)
    .leftJoin(createdByUser, eq(pages.createdBy, createdByUser.id))
    .leftJoin(updatedByUser, eq(pages.updatedBy, updatedByUser.id))
    .where(eq(pages.slug, slug))
    .limit(1);
  if (!row) return null;
  return { ...row.page, createdByName: row.createdByName ?? "Unknown", updatedByName: row.updatedByName ?? "Unknown" };
}

export async function getPageRevisions(slug: string) {
  const page = await getPageBySlug(slug);
  if (!page) return null;
  const revisions = await db
    .select({
      revisionNo: pageRevisions.revisionNo,
      summary: pageRevisions.summary,
      changes: pageRevisions.changes,
      createdAt: pageRevisions.createdAt,
      authorName: users.displayName,
    })
    .from(pageRevisions)
    .leftJoin(users, eq(pageRevisions.authorId, users.id))
    .where(eq(pageRevisions.pageId, page.id))
    .orderBy(desc(pageRevisions.revisionNo));
  return { title: page.title, revisions };
}

export interface SearchEntry {
  title: string;
  url: string;
  type: string;
  excerpt: string;
}

export async function getSearchEntries(): Promise<SearchEntry[]> {
  const entries: SearchEntry[] = [
    { title: "Shelves — Home", url: "/", type: "Home", excerpt: "NimbusVault Knowledge Base overview" },
    { title: "All Books", url: "/books", type: "Books", excerpt: "Every book across every shelf" },
    { title: "Assets", url: "/assets", type: "Assets", excerpt: "Typed CMDB inventory of hardware, software, and services" },
  ];

  const shelfList = await getShelves();
  for (const shelf of shelfList) {
    entries.push({ title: shelf.title, url: `/shelves/${shelf.slug}`, type: "Shelf", excerpt: shelf.description });
    for (const book of shelf.books) {
      entries.push({ title: book.title, url: `/books/${book.slug}`, type: "Book", excerpt: book.description });
    }
  }

  const allPages = await db
    .select({ slug: pages.slug, title: pages.title, region: pages.region, bookSlug: books.slug, bookTitle: books.title })
    .from(pages)
    .innerJoin(books, eq(pages.bookId, books.id));

  for (const p of allPages) {
    entries.push({
      title: p.title,
      url: `/books/${p.bookSlug}/page/${p.slug}`,
      type: "Page",
      excerpt: p.region ? `${p.region} — ${p.bookTitle}` : p.bookTitle,
    });
  }

  const allAssets = await db
    .select({ slug: assets.slug, name: assets.name, type: assets.type, status: assets.status })
    .from(assets);

  for (const a of allAssets) {
    entries.push({
      title: a.name,
      url: `/assets/${a.slug}`,
      type: "Asset",
      excerpt: a.status === "decommissioned" ? `${a.type} — decommissioned` : a.type,
    });
  }

  return entries;
}
