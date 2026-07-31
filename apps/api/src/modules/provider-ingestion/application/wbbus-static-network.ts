import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
  CanonicalTrip,
} from '../domain/canonical-mobility';

export interface WBBusDiscoveryItem {
  externalId: string;
  url: string;
  pageNumber?: number;
}

export interface WBBusStoppage {
  slNo: string;
  upTime: string;
  stoppageName: string;
  downTime: string;
}

export interface WBBusRawBus {
  source: 'WBBUS';
  sourceUrl: string;
  name: string | null;
  alternateName: string | null;
  agencyName: string | null;
  registration: string | null;
  busType: string | null;
  contactNumber: string | null;
  alternateNumber: string | null;
  origin: string | null;
  destination: string | null;
  uploadedBy: string | null;
  schedule: WBBusStoppage[];
  notes: string | null;
  scrapedAt: string;
  rawRecordId: string;
  contentHash: string;
}

export interface WBBusCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
  sourceObservations: CanonicalSourceObservation[];
}

export interface WBBusValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class WBBusDirectoryParser {
  discoverBusLinks(directoryUrl: string, html: string): { busUrls: string[]; nextPageUrl?: string } {
    const $ = cheerio.load(html);
    const busUrls = new Set<string>();

    $('a[href*="/bus/"]').each((_, element) => {
      const href = $(element).attr('href');
      if (href) {
        busUrls.add(new URL(href, directoryUrl).href);
      }
    });

    let nextPageUrl: string | undefined;
    $('a').each((_, element) => {
      const text = $(element).text().trim().toLowerCase();
      if (text.includes('next') || text.includes('»')) {
        const href = $(element).attr('href');
        if (href) {
          nextPageUrl = new URL(href, directoryUrl).href;
        }
      }
    });

    return {
      busUrls: Array.from(busUrls),
      nextPageUrl,
    };
  }
}

export class WBBusParser {
  parseBusHtml(sourceUrl: string, html: string, rawRecordId: string, contentHash: string): WBBusRawBus {
    const $ = cheerio.load(html);
    const details: Record<string, string> = {};

    $('table.table-striped tr').each((_, row) => {
      const cols = $(row).find('td');
      if (cols.length >= 2) {
        const key = $(cols[0]).text().replace(':', '').trim();
        const value = $(cols[1]).text().replace(/\s+/g, ' ').trim();
        details[key] = value;
      }
    });

    const schedule: WBBusStoppage[] = [];
    $('.row.sud').each((_, row) => {
      const cols = $(row).find('div');
      if (cols.length >= 4) {
        schedule.push({
          slNo: $(cols[0]).text().trim(),
          upTime: $(cols[1]).text().trim(),
          stoppageName: $(cols[2]).text().replace(/\s+/g, ' ').trim(),
          downTime: $(cols[3]).text().trim(),
        });
      }
    });

    let notes: string | null = null;
    $('.card').each((_, card) => {
      const header = $(card).find('.card-header').text().trim();
      if (header.includes('Bus Notes')) {
        notes = $(card).find('.card-body').text().replace(/\s+/g, ' ').trim();
      }
    });

    return {
      source: 'WBBUS',
      sourceUrl,
      name: details['Bus Name'] || null,
      alternateName: details['Alternate Name'] || null,
      agencyName: details['Agency Name'] || null,
      registration: details['Registration Number'] || null,
      busType: details['Bus Type'] || null,
      contactNumber: details['Contact Number'] || null,
      alternateNumber: details['Alternate Number'] || null,
      origin: details['Depot Name'] || null,
      destination: details['Destination'] || null,
      uploadedBy: details['Upload By'] || null,
      schedule,
      notes,
      scrapedAt: new Date().toISOString(),
      rawRecordId,
      contentHash,
    };
  }
}

export class WBBusValidator {
  validate(records: WBBusRawBus[]): WBBusValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!records.length) {
      errors.push('Parsed WBBus output is empty.');
    }

    for (const record of records) {
      if (!record.rawRecordId) {
        errors.push(`${record.sourceUrl} has no raw source record.`);
      }

      const validStops = record.schedule.filter(stop => stop.stoppageName.trim());
      if (validStops.length < 2) {
        errors.push(`${record.sourceUrl} has fewer than two valid stops.`);
      }

      if (!record.registration) {
        warnings.push(`${record.sourceUrl} is missing vehicle registration.`);
      }

      if (!record.name) {
        warnings.push(`${record.sourceUrl} is missing bus name.`);
      }

      for (const stop of validStops) {
        if (!usableTime(stop.upTime) && !usableTime(stop.downTime)) {
          warnings.push(`${record.sourceUrl} stop ${stop.stoppageName} has no usable UP/DOWN time.`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: Array.from(new Set(warnings)),
    };
  }
}

export class WBBusMapper {
  map(records: WBBusRawBus[]): WBBusCanonicalOutput {
    const agencyMap = new Map<string, CanonicalAgency>();
    const nodeMap = new Map<string, CanonicalMobilityNode>();
    const routePatterns: CanonicalRoutePattern[] = [];
    const trips: CanonicalTrip[] = [];
    const observations: CanonicalSourceObservation[] = [];

    for (const record of records) {
      const agencyName = record.agencyName || 'Private Buses of West Bengal';
      const agencyExternalId = slug(agencyName);
      const validStops = record.schedule.filter(stop => stop.stoppageName.trim());
      const busExternalId = externalIdFromSourceUrl(record.sourceUrl);

      agencyMap.set(agencyExternalId, {
        externalId: agencyExternalId,
        providerCode: 'WBBUS',
        name: agencyName,
        geography: {
          countryCode: 'IN',
          stateCode: 'WB',
          city: 'Kolkata',
        },
      });

      for (const stop of validStops) {
        const name = cleanName(stop.stoppageName);
        const externalId = slug(name);
        nodeMap.set(externalId, {
          externalId,
          providerCode: 'WBBUS',
          nodeType: 'BUS_STOP',
          name,
          normalizedName: normalizeStopName(name),
          aliases: [],
          geography: {
            countryCode: 'IN',
            stateCode: 'WB',
            city: 'Kolkata',
          },
          confidence: 0.55,
        });
      }

      const upRouteExternalId = `${busExternalId}:up`;
      const downRouteExternalId = `${busExternalId}:down`;
      const upStops = validStops.map((stop, index) => ({
        nodeExternalId: slug(stop.stoppageName),
        name: cleanName(stop.stoppageName),
        sequence: index + 1,
        pickupAllowed: true,
        dropoffAllowed: true,
      }));
      const downStops = [...validStops].reverse().map((stop, index) => ({
        nodeExternalId: slug(stop.stoppageName),
        name: cleanName(stop.stoppageName),
        sequence: index + 1,
        pickupAllowed: true,
        dropoffAllowed: true,
      }));

      routePatterns.push({
        externalId: upRouteExternalId,
        providerCode: 'WBBUS',
        agencyExternalId,
        mode: 'BUS',
        shortName: record.name || undefined,
        longName: `${upStops[0]?.name || record.origin || 'Unknown'} - ${upStops[upStops.length - 1]?.name || record.destination || 'Unknown'}`,
        directionId: 'UP',
        operationalStatus: 'UNKNOWN',
        serviceClass: 'REGULAR',
        stops: upStops,
      });
      routePatterns.push({
        externalId: downRouteExternalId,
        providerCode: 'WBBUS',
        agencyExternalId,
        mode: 'BUS',
        shortName: record.name || undefined,
        longName: `${downStops[0]?.name || record.destination || 'Unknown'} - ${downStops[downStops.length - 1]?.name || record.origin || 'Unknown'}`,
        directionId: 'DOWN',
        operationalStatus: 'UNKNOWN',
        serviceClass: 'REGULAR',
        stops: downStops,
      });

      trips.push({
        externalId: `${busExternalId}:up:trip`,
        providerCode: 'WBBUS',
        routeExternalId: upRouteExternalId,
        direction: 'UP',
        vehicleRegistration: normalizeRegistration(record.registration),
        vehicleName: record.name || undefined,
        operationalStatus: 'UNKNOWN',
        serviceClass: 'REGULAR',
        stopTimes: validStops.map((stop, index) => ({
          stopExternalId: slug(stop.stoppageName),
          stopName: cleanName(stop.stoppageName),
          sequence: index + 1,
          arrivalTime: usableTime(stop.upTime),
          departureTime: usableTime(stop.upTime),
          timeIsEstimated: false,
        })),
      });
      trips.push({
        externalId: `${busExternalId}:down:trip`,
        providerCode: 'WBBUS',
        routeExternalId: downRouteExternalId,
        direction: 'DOWN',
        vehicleRegistration: normalizeRegistration(record.registration),
        vehicleName: record.name || undefined,
        operationalStatus: 'UNKNOWN',
        serviceClass: 'REGULAR',
        stopTimes: [...validStops].reverse().map((stop, index) => ({
          stopExternalId: slug(stop.stoppageName),
          stopName: cleanName(stop.stoppageName),
          sequence: index + 1,
          arrivalTime: usableTime(stop.downTime),
          departureTime: usableTime(stop.downTime),
          timeIsEstimated: false,
        })),
      });

      observations.push({
        providerCode: 'WBBUS',
        providerVersion: 'v1',
        sourceUrl: record.sourceUrl,
        fetchedAt: record.scrapedAt,
        contentHash: record.contentHash,
        rawRecordId: record.rawRecordId,
        confidence: 0.55,
        verificationStatus: 'UNVERIFIED',
        warnings: [],
      });
    }

    return {
      agencies: Array.from(agencyMap.values()),
      nodes: Array.from(nodeMap.values()),
      routePatterns,
      trips,
      sourceObservations: observations,
    };
  }
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function externalIdFromSourceUrl(url: string): string {
  try {
    const path = new URL(url).pathname.replace(/^\/bus\//, '').replace(/\/$/, '');
    return slug(decodeURIComponent(path)) || sha256(url).slice(0, 16);
  } catch {
    return sha256(url).slice(0, 16);
  }
}

export function slug(value: string): string {
  return cleanName(value)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeStopName(value: string): string {
  return cleanName(value).toLowerCase();
}

export function normalizeRegistration(value: string | null): string | undefined {
  return value?.trim().toUpperCase().replace(/\s+/g, '') || undefined;
}

export function usableTime(value?: string): string | undefined {
  if (!value || value.trim() === '_ _ : _ _') {
    return undefined;
  }

  return /^([01]?\d|2[0-3]):[0-5]\d$/.test(value.trim()) ? value.trim() : undefined;
}
