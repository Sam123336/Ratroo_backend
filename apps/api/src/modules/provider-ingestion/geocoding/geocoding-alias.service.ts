import { Injectable } from '@nestjs/common';

@Injectable()
export class GeocodingAliasService {
  // A dictionary for mapping known aliases and provider-specific names
  private readonly aliasMap: Record<string, string> = {
    'arambagh': 'arambag',
    'kgp': 'kharagpur',
    'kharagpur': 'kharagpur',
    'howrah stn': 'howrah station',
    'sdl': 'sealdah',
    'burdwan': 'bardhaman',
    'midnapore': 'medinipur',
    'chinsurah': 'chuchura',
    // We can expand this over time based on failure logs
  };

  /**
   * Cleans a stop name by stripping out common suffixes and normalizing
   */
  normalizeName(name: string): string {
    let clean = name.toLowerCase().trim();

    // Remove common stop suffixes and descriptors
    clean = clean.replace(/\b(bus stop|bus stand|bus terminus|terminus|bazar|more|mor|cross|crossing|gate|old|new|station|halt|stn)\b/g, '');
    
    // Remove anything inside parentheses
    clean = clean.replace(/\(.*?\)/g, '');

    // Trim double spaces and whitespace
    clean = clean.replace(/\s+/g, ' ').trim();

    // Map through alias dictionary if an exact match exists
    if (this.aliasMap[clean]) {
      clean = this.aliasMap[clean];
    }

    return clean;
  }

  /**
   * Resolves aliases for a raw name. If no alias applies, returns the raw name.
   */
  resolveAlias(name: string): string {
    const lower = name.toLowerCase().trim();
    return this.aliasMap[lower] || lower;
  }

  /**
   * Computes the Levenshtein distance between two strings.
   * A lightweight implementation to avoid external dependencies.
   */
  levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = Array.from({ length: b.length + 1 }, () => new Array(a.length + 1).fill(0));

    for (let i = 0; i <= a.length; i++) matrix[0][i] = i;
    for (let j = 0; j <= b.length; j++) matrix[j][0] = j;

    for (let j = 1; j <= b.length; j++) {
      for (let i = 1; i <= a.length; i++) {
        if (a[i - 1] === b[j - 1]) {
          matrix[j][i] = matrix[j - 1][i - 1];
        } else {
          matrix[j][i] = Math.min(
            matrix[j - 1][i - 1] + 1, // substitution
            matrix[j][i - 1] + 1,     // insertion
            matrix[j - 1][i] + 1      // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }

  /**
   * Calculates a similarity score between 0.0 and 1.0 based on Levenshtein distance.
   */
  similarityScore(a: string, b: string): number {
    const dist = this.levenshteinDistance(a, b);
    const maxLen = Math.max(a.length, b.length);
    if (maxLen === 0) return 1.0;
    return (maxLen - dist) / maxLen;
  }
}
