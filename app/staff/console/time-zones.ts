/**
 * F-O3: the time zone is load-bearing for every date on a team, so it is picked
 * from a validated list rather than typed. The browser's own IANA database is
 * the authority where it exposes one; the fallback is the set a youth club in
 * this product's reach would plausibly need.
 */
const FALLBACK_ZONES = [
  "UTC",
  "America/Anchorage",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/New_York",
  "America/Phoenix",
  "America/Toronto",
  "America/Vancouver",
  "Australia/Melbourne",
  "Australia/Sydney",
  "Europe/Amsterdam",
  "Europe/Berlin",
  "Europe/Dublin",
  "Europe/Lisbon",
  "Europe/London",
  "Europe/Madrid",
  "Europe/Paris",
  "Europe/Stockholm",
  "Pacific/Auckland",
];

export function timeZones(): string[] {
  const supported = (
    Intl as unknown as { supportedValuesOf?: (key: string) => string[] }
  ).supportedValuesOf;
  if (typeof supported !== "function") return FALLBACK_ZONES;
  try {
    const zones = supported.call(Intl, "timeZone");
    return zones.length ? zones : FALLBACK_ZONES;
  } catch {
    return FALLBACK_ZONES;
  }
}

/** The team's current zone may predate the browser's list, so a picker must
 * still be able to show it. */
export function timeZonesIncluding(current: string | undefined): string[] {
  const zones = timeZones();
  if (current && !zones.includes(current)) return [current, ...zones];
  return zones;
}

export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
