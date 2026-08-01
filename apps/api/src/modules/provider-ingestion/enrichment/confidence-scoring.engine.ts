import { Injectable } from '@nestjs/common';
import { SourceType } from '../domain/canonical-mobility';

export interface SourceConfidenceReport {
  canonicalId: string;
  supportingProviders: Array<{
    code: string;
    sourceType: SourceType;
    isVerified: boolean;
  }>;
  confidenceScore: number;
  confidencePercentage: string;
  isHighConfidence: boolean;
}

@Injectable()
export class ConfidenceScoringEngine {
  private readonly sourceWeights: Record<SourceType, number> = {
    GOVERNMENT: 0.40,
    GOVERNMENT_GIS: 0.38,
    GOVERNMENT_APP: 0.35,
    OPERATOR: 0.30,
    OPEN_DATA: 0.25,
    COMMUNITY: 0.20,
    THIRD_PARTY: 0.15,
  };

  calculateConfidence(
    canonicalId: string,
    supportingProviders: Array<{ code: string; sourceType: SourceType; isVerified?: boolean }>
  ): SourceConfidenceReport {
    if (!supportingProviders || supportingProviders.length === 0) {
      return {
        canonicalId,
        supportingProviders: [],
        confidenceScore: 0.30,
        confidencePercentage: '30%',
        isHighConfidence: false,
      };
    }

    let baseScore = 0.40;
    const seenTypes = new Set<SourceType>();

    supportingProviders.forEach((prov) => {
      const weight = this.sourceWeights[prov.sourceType] || 0.15;
      if (!seenTypes.has(prov.sourceType)) {
        baseScore += weight;
        seenTypes.add(prov.sourceType);
      } else {
        baseScore += 0.05; // diminished bonus for extra providers of same type
      }
      if (prov.isVerified) {
        baseScore += 0.08;
      }
    });

    const finalScore = Math.min(0.99, Number(baseScore.toFixed(2)));
    const percentage = `${Math.round(finalScore * 100)}%`;

    return {
      canonicalId,
      supportingProviders: supportingProviders.map((p) => ({
        code: p.code,
        sourceType: p.sourceType,
        isVerified: !!p.isVerified,
      })),
      confidenceScore: finalScore,
      confidencePercentage: percentage,
      isHighConfidence: finalScore >= 0.85,
    };
  }
}
