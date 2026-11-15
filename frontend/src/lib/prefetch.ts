/**
 * Order in which to warm the other dates of a timeline while one is open: the nearest dates first
 * (the next one before the previous one at the same distance), so stepping or playing through the
 * series finds each picture already prepared. `limit` caps how many are loaded in the background.
 */
export function prefetchOrder(count: number, index: number, limit = count): number[] {
  const out: number[] = [];
  if (index < 0 || index >= count) return out;
  for (let d = 1; d < count && out.length < limit; d++) {
    if (index + d < count) out.push(index + d);
    if (index - d >= 0 && out.length < limit) out.push(index - d);
  }
  return out;
}
