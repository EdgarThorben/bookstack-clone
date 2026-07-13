export interface Crumb {
  label: string;
  href: string;
  icon: string;
  current?: boolean;
}

export function breadcrumbForPage(opts: {
  shelvesLabel?: string;
  shelfTitle: string;
  shelfSlug: string;
  bookTitle: string;
  bookSlug: string;
  chapterTitle?: string | null;
  pageTitle: string;
}): Crumb[] {
  const items: Crumb[] = [
    { label: opts.shelvesLabel ?? "Shelves", href: "/", icon: "shelf" },
    { label: opts.shelfTitle, href: `/shelves/${opts.shelfSlug}`, icon: "shelf" },
    { label: opts.bookTitle, href: `/books/${opts.bookSlug}`, icon: "book" },
  ];
  if (opts.chapterTitle) {
    items.push({ label: opts.chapterTitle, href: `/books/${opts.bookSlug}`, icon: "chapter" });
  }
  items.push({ label: opts.pageTitle, href: "", icon: "page", current: true });
  return items;
}
