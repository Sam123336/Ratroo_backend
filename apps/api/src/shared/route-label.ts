/**
 * How one bus service is named on screen.
 *
 * The number is what a rider looks for on the front of the bus, so it leads.
 * Search, the nearby list and the journey planner each built this label their
 * own way and only one of them knew the number existed, which is why the same
 * service read as "335-E" in one place and "KBS-ANK" in another.
 *
 * Nothing is invented to fill a gap: a route whose provider publishes no
 * number is shown by name alone, and a provider that publishes only an
 * internal code shows that code rather than a prettier guess.
 */
export function routeLabel(shortName: string | null | undefined, longName: string | null | undefined): string {
  const number = (shortName ?? '').trim();
  const name = (longName ?? '').trim();

  if (!number) return name;
  if (!name || name === number) return number;
  return `${number} — ${name}`;
}
