export type CollectionFilter = "all" | "avatar" | "team_lounge";
export function collectionFilter(value: string | null): CollectionFilter {
  return value === "avatar" || value === "team_lounge" ? value : "all";
}
export function collectionReturn(filter: string | null, item: string | null) {
  return `/prizes?filter=${collectionFilter(filter)}#${item ? `prize-item-${encodeURIComponent(item)}` : "collection-title"}`;
}
