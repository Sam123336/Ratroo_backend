/**
 * Deep links into an operator's own site.
 *
 * "Open WBBUS website" used to land on wbbus.in's front page, where the user
 * had to retype the route they were already looking at into a Start/Destination
 * form. These point at the page for that exact route or stop instead.
 *
 * Only links that have been confirmed to resolve are returned. Null means we
 * have no page for it, and the client hides the link rather than sending
 * someone to a search form.
 */

/**
 * What each operator was checked for, and what came back. Re-probe before
 * assuming any of this still holds.
 *
 *   WBBUS     per-route AND per-stop pages. /bus/<slug> and
 *             /search/view?searchType=3&stop=<name>. Both confirmed.
 *   WBTC      search is POST-only (hid_departure_stoppage / hid_arrival_
 *             stoppage), so no per-route link. It does publish one real page
 *             listing every city bus route, which beats the front door.
 *             Its tram and ferry paths return 200 with an EMPTY body — as does
 *             a deliberately invented path — so that site's status codes mean
 *             nothing and only pages with real content are linked here.
 *   NBSTC     JSF with jsessionid + ViewState. Stateful POST, nothing linkable.
 *   BMTC      links out to ksrtc.in/search?fromCity=368|Bengaluru..., which
 *             needs their internal city ids. We hold none.
 *   SBSTC     sbstc.co.in does not resolve.
 *   WBBUSTIME 403 to non-browser clients.
 *   BUSSATHI  bussathi.in does not resolve.
 *   WB_FERRY, KOLKATA_TRAM, EASTERN_RAILWAY_SUBURBAN
 *             no operator site with addressable routes found.
 */

/** WBBUS slugs look like "aniket-wb41g0280-barakar-arambagh-81". */
const WBBUS_SLUG = /^[a-z0-9][a-z0-9-]*-\d+$/;

/**
 * The page slug inside a WBBUS externalId, or null if there isn't one.
 *
 * Two shapes are stored, from two ingestion passes:
 *   "aniket-wb41g0280-barakar-arambagh-81:up"
 *   "wbbus:bus:noor-travels-wb15d5736-kolkata-bishnupur-113:route"
 * Handling only the first left half the catalogue unlinkable.
 */
function wbbusSlug(externalId: string): string | null {
  const cleaned = externalId
    .replace(/^wbbus:bus:/, '')
    .replace(/:(?:route|up|down)$/, '');

  return WBBUS_SLUG.test(cleaned) ? cleaned : null;
}

/**
 * The best page an operator has for browsing routes, when it has no page for
 * an individual one. Not a substitute for a deep link — just closer than the
 * home page.
 */
const ROUTE_INDEX: Record<string, string> = {
  WBTC: 'https://wbtconline.in/wbtc-city-bus-routes',
};

/**
 * The operator's page for one route.
 *
 * A WBBUS route's externalId *is* the page slug, with an optional `:up` /
 * `:down` suffix naming the working. Routes ingested by another path carry a
 * UUID instead, which resolves to nothing.
 */
export function routeSourceUrl(
  provider: string | null | undefined,
  externalId: string | null | undefined,
): string | null {
  if (!provider) return null;

  if (provider === 'WBBUS' && externalId) {
    const slug = wbbusSlug(externalId);
    if (slug) return `https://wbbus.in/bus/${slug}`;
    // A UUID externalId came from another ingestion path; there is no page.
    return null;
  }

  return ROUTE_INDEX[provider] ?? null;
}

/** True when the URL is the operator's page for this exact route. */
export function isExactRouteLink(
  provider: string | null | undefined,
  externalId: string | null | undefined,
): boolean {
  return provider === 'WBBUS' && wbbusSlug(externalId ?? '') !== null;
}

/**
 * Every bus running between two points, on WBBus.in.
 *
 * This is a cross-operator index, not one operator's page: searching Kolkata →
 * Arambagh returns NOOR TRAVELS, MAHAMAYA, ROCKET and others regardless of who
 * we attribute a route to. It is therefore the only useful "see the source"
 * link for SBSTC, NBSTC and the rest, which publish nothing addressable.
 *
 * The names must be WBBus's own: its search is exact AND case-sensitive, so
 * "KOLKATA" finds nothing where "Kolkata" finds five, and "ARAMBAG" is not
 * "Arambagh". Callers must pass names taken from WBBUS-provider stops, which
 * carry that vocabulary — see how routes.controller resolves them via the
 * shared canonical place.
 */
export function routeSearchUrl(
  origin: string | null | undefined,
  destination: string | null | undefined,
): string | null {
  if (!origin?.trim() || !destination?.trim()) return null;

  const from = encodeURIComponent(origin.trim());
  const to = encodeURIComponent(destination.trim());
  return `https://wbbus.in/search/view?searchType=1&dipo=${from}&desti=${to}`;
}

/** The operator's timetable page for one stop, keyed by the stop's name. */
export function stopSourceUrl(
  provider: string | null | undefined,
  stopName: string | null | undefined,
): string | null {
  if (provider !== 'WBBUS' || !stopName?.trim()) return null;

  const stop = encodeURIComponent(stopName.trim());
  return `https://wbbus.in/search/view?searchType=3&stop=${stop}`;
}
