import type { PageDetail, RevisionChange } from "../db/schema";

export function diffDetails(previous: PageDetail[], next: PageDetail[]): RevisionChange[] {
  const changes: RevisionChange[] = [];
  const prevMap = new Map(previous.map((d) => [d.label, d.value]));
  const nextMap = new Map(next.map((d) => [d.label, d.value]));

  for (const [label, value] of nextMap) {
    const prevValue = prevMap.get(label);
    if (prevValue === undefined) {
      changes.push({ field: label, from: "(not documented)", to: value });
    } else if (prevValue !== value) {
      changes.push({ field: label, from: prevValue, to: value });
    }
  }

  for (const [label, value] of prevMap) {
    if (!nextMap.has(label)) {
      changes.push({ field: label, from: value, to: "(removed)" });
    }
  }

  return changes;
}
