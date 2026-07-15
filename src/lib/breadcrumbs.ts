export interface Crumb {
  label: string;
  href: string;
  icon: string;
  current?: boolean;
}

export function breadcrumbForItem(opts: {
  homeLabel?: string;
  collectionTitle: string;
  collectionSlug: string;
  section?: string | null;
  itemName: string;
}): Crumb[] {
  const items: Crumb[] = [
    { label: opts.homeLabel ?? "Home", href: "/", icon: "shelf" },
    { label: opts.collectionTitle, href: `/collections/${opts.collectionSlug}`, icon: "book" },
  ];
  if (opts.section) {
    items.push({ label: opts.section, href: `/collections/${opts.collectionSlug}`, icon: "chapter" });
  }
  items.push({ label: opts.itemName, href: "", icon: "page", current: true });
  return items;
}
