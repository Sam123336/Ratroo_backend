/**
 * Pure domain service for normalizing stop names.
 * Framework-independent — no NestJS imports.
 */
export class StopNormalizer {
  static normalize(name: string): string {
    return name
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^a-z0-9\s\-./,()]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}
