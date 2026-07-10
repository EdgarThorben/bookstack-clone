// Curated, verified-free-license Unsplash photos (server racks / data centers / networking),
// used instead of random unrelated stock photos. Selection is deterministic per seed string
// so the same entity always gets the same photo.
const POOL = [
  "https://images.unsplash.com/photo-1695668548342-c0c1ad479aee", // rack of servers in a server room
  "https://images.unsplash.com/photo-1682559736721-c2e77ff4c650", // cables connected to a server
  "https://images.unsplash.com/photo-1558494949-ef010cbdcc31", // cable network patch panel
  "https://images.unsplash.com/photo-1680691257251-5fead813b73e", // network switch close-up
];

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return h;
}

export function serverImage(seed: string, width = 900, height = 500): string {
  const photo = POOL[hashSeed(seed) % POOL.length];
  return `${photo}?w=${width}&h=${height}&q=80&auto=format&fit=crop`;
}
