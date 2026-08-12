/**
 * Normalising the departure times operators publish.
 *
 * Everything downstream compares times as strings, so "4:25 AM" sorts after
 * "21:15" and the app's HH:MM parser rejects it outright — those departures
 * silently vanish from "upcoming".
 */
/** "4:25 AM" / "12:05 PM" / "05:55:00" / "21:15" -> "HH:MM", or null if unrecognised. */
export function normaliseTime(raw: string | null): string | null {
  if (!raw) return null;

  const value = raw.trim();
  const pad = (n: number) => n.toString().padStart(2, '0');

  const meridiem = /^(\d{1,2}):(\d{2})\s*([AP])M$/i.exec(value);
  if (meridiem) {
    const minutes = Number(meridiem[2]);
    let hours = Number(meridiem[1]) % 12;
    if (meridiem[3].toUpperCase() === 'P') hours += 12;
    if (minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const withSeconds = /^(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (withSeconds) {
    const hours = Number(withSeconds[1]);
    const minutes = Number(withSeconds[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  const plain = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (plain) {
    const hours = Number(plain[1]);
    const minutes = Number(plain[2]);
    if (hours > 23 || minutes > 59) return null;
    return `${pad(hours)}:${pad(minutes)}`;
  }

  return null;
}