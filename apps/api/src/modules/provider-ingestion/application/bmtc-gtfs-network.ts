import { createHash } from 'crypto';
import { inflateRawSync } from 'zlib';
import {
  CanonicalAgency,
  CanonicalMobilityNode,
  CanonicalRoutePattern,
  CanonicalSourceObservation,
  CanonicalTrip,
  ServiceClass,
} from '../domain/canonical-mobility';

export interface BmtcGtfsRawFeed {
  url: string;
  buffer: Buffer;
  contentHash: string;
  contentType?: string;
  statusCode: number;
  fetchedAt: string;
  rawRecordId: string;
}

export interface BmtcGtfsCanonicalOutput {
  agencies: CanonicalAgency[];
  nodes: CanonicalMobilityNode[];
  routePatterns: CanonicalRoutePattern[];
  trips: CanonicalTrip[];
  sourceObservations: CanonicalSourceObservation[];
}

type GtfsRecord = Record<string, string>;

interface GtfsTables {
  agency: GtfsRecord[];
  routes: GtfsRecord[];
  stops: GtfsRecord[];
  trips: GtfsRecord[];
  stopTimes: GtfsRecord[];
}

export function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

export class BmtcGtfsZipReader {
  read(buffer: Buffer): Map<string, string> {
    const entries = new Map<string, string>();
    const centralDirectoryOffset = this.centralDirectoryOffset(buffer);
    let offset = centralDirectoryOffset;

    while (offset < buffer.length - 46 && buffer.readUInt32LE(offset) === 0x02014b50) {
      const compressionMethod = buffer.readUInt16LE(offset + 10);
      const compressedSize = buffer.readUInt32LE(offset + 20);
      const fileNameLength = buffer.readUInt16LE(offset + 28);
      const extraFieldLength = buffer.readUInt16LE(offset + 30);
      const fileCommentLength = buffer.readUInt16LE(offset + 32);
      const localHeaderOffset = buffer.readUInt32LE(offset + 42);
      const fileName = buffer.toString('utf8', offset + 46, offset + 46 + fileNameLength);
      const localFileNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraFieldLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
      const dataEnd = dataStart + compressedSize;
      const compressed = buffer.subarray(dataStart, dataEnd);

      if (fileName.endsWith('.txt')) {
        const content =
          compressionMethod === 0
            ? compressed.toString('utf8')
            : compressionMethod === 8
              ? inflateRawSync(compressed).toString('utf8')
              : '';

        if (content) {
          entries.set(fileName.split('/').pop() || fileName, content.replace(/^\uFEFF/, ''));
        }
      }

      offset += 46 + fileNameLength + extraFieldLength + fileCommentLength;
    }

    return entries;
  }

  private centralDirectoryOffset(buffer: Buffer) {
    for (let offset = buffer.length - 22; offset >= 0; offset--) {
      if (buffer.readUInt32LE(offset) === 0x06054b50) {
        return buffer.readUInt32LE(offset + 16);
      }
    }

    throw new Error('Invalid ZIP file: central directory was not found.');
  }
}

export class BmtcGtfsParser {
  parse(rawFeed: BmtcGtfsRawFeed, options: { includeTrips?: boolean; maxRoutePatterns?: number } = {}): BmtcGtfsCanonicalOutput {
    const files = new BmtcGtfsZipReader().read(rawFeed.buffer);
    const tables: GtfsTables = {
      agency: this.parseCsv(this.required(files, 'agency.txt')),
      routes: this.parseCsv(this.required(files, 'routes.txt')),
      stops: this.parseCsv(this.required(files, 'stops.txt')),
      trips: this.parseCsv(this.required(files, 'trips.txt')),
      stopTimes: this.parseCsv(this.required(files, 'stop_times.txt')),
    };
    const stopTimesByTripId = this.groupBy(tables.stopTimes, 'trip_id');
    const tripsByRouteDirection = this.groupTripsByRouteDirection(tables.trips);
    const stopsById = new Map(tables.stops.map(stop => [stop.stop_id, stop]));
    const routePatterns: CanonicalRoutePattern[] = [];
    const trips: CanonicalTrip[] = [];

    for (const [routeDirectionKey, routeTrips] of tripsByRouteDirection) {
      if (options.maxRoutePatterns && routePatterns.length >= options.maxRoutePatterns) {
        break;
      }

      const [routeId, directionId = 'unknown'] = routeDirectionKey.split('::');
      const route = tables.routes.find(item => item.route_id === routeId);
      if (!route) {
        continue;
      }

      const representativeTrip = this.representativeTrip(routeTrips, stopTimesByTripId);
      const representativeStopTimes = this.orderedStopTimes(stopTimesByTripId.get(representativeTrip.trip_id) || []);
      const routeExternalId = this.routeExternalId(routeId, directionId);
      const routeStops = representativeStopTimes
        .filter(stopTime => stopsById.has(stopTime.stop_id))
        .map((stopTime, index) => ({
          nodeExternalId: this.stopExternalId(stopTime.stop_id),
          name: stopsById.get(stopTime.stop_id)?.stop_name || stopTime.stop_id,
          sequence: Number(stopTime.stop_sequence || index + 1),
          pickupAllowed: stopTime.pickup_type !== '1',
          dropoffAllowed: stopTime.drop_off_type !== '1',
        }));

      if (routeStops.length < 2) {
        continue;
      }

      routePatterns.push({
        externalId: routeExternalId,
        providerCode: 'BMTC_OFFICIAL',
        agencyExternalId: this.agencyExternalId(route.agency_id || tables.agency[0]?.agency_id || 'BMTC'),
        mode: 'BUS',
        shortName: route.route_short_name || route.route_id,
        longName: route.route_long_name || route.route_short_name || route.route_id,
        directionId,
        operationalStatus: 'ACTIVE',
        serviceClass: this.serviceClass(route),
        stops: routeStops,
      });

      if (!options.includeTrips) {
        continue;
      }

      for (const trip of routeTrips) {
        const stopTimes = this.orderedStopTimes(stopTimesByTripId.get(trip.trip_id) || []);
        if (stopTimes.length < 2) {
          continue;
        }

        trips.push({
          externalId: this.tripExternalId(trip.trip_id),
          providerCode: 'BMTC_OFFICIAL',
          routeExternalId,
          serviceName: trip.trip_headsign || trip.service_id,
          direction: directionId === '1' ? 'INBOUND' : 'OUTBOUND',
          operationalStatus: 'ACTIVE',
          serviceClass: this.serviceClass(route),
          stopTimes: stopTimes
            .filter(stopTime => stopsById.has(stopTime.stop_id))
            .map((stopTime, index) => ({
              stopExternalId: this.stopExternalId(stopTime.stop_id),
              stopName: stopsById.get(stopTime.stop_id)?.stop_name || stopTime.stop_id,
              sequence: Number(stopTime.stop_sequence || index + 1),
              arrivalTime: stopTime.arrival_time || undefined,
              departureTime: stopTime.departure_time || undefined,
            })),
        });
      }
    }

    return {
      agencies: tables.agency.map(agency => ({
        externalId: this.agencyExternalId(agency.agency_id || agency.agency_name || 'BMTC'),
        providerCode: 'BMTC_OFFICIAL',
        name: agency.agency_name || 'Bengaluru Metropolitan Transport Corporation',
        shortName: 'BMTC',
        phone: agency.agency_phone || undefined,
        website: agency.agency_url || 'https://mybmtc.karnataka.gov.in/',
        geography: {
          countryCode: 'IN',
          stateCode: 'KA',
          district: 'Bengaluru Urban',
          metropolitanArea: 'Bengaluru',
          city: 'Bengaluru',
        },
      })),
      nodes: tables.stops
        .filter(stop => !stop.location_type || stop.location_type === '0')
        .map(stop => ({
          externalId: this.stopExternalId(stop.stop_id),
          providerCode: 'BMTC_OFFICIAL',
          nodeType: 'BUS_STOP',
          name: stop.stop_name || stop.stop_id,
          normalizedName: normalizeName(stop.stop_name || stop.stop_id),
          aliases: [],
          latitude: this.numberOrUndefined(stop.stop_lat),
          longitude: this.numberOrUndefined(stop.stop_lon),
          geography: {
            countryCode: 'IN',
            stateCode: 'KA',
            district: 'Bengaluru Urban',
            metropolitanArea: 'Bengaluru',
            city: 'Bengaluru',
          },
          confidence: 0.82,
        })),
      routePatterns,
      trips,
      sourceObservations: [
        {
          providerCode: 'BMTC_OFFICIAL',
          providerVersion: 'v1',
          sourceUrl: rawFeed.url,
          fetchedAt: rawFeed.fetchedAt,
          contentHash: rawFeed.contentHash,
          rawRecordId: rawFeed.rawRecordId,
          confidence: 0.78,
          verificationStatus: 'AUTO_VALIDATED',
          warnings: [
            'BMTC GTFS source is currently treated as community/derived data until official publication is confirmed.',
          ],
        },
      ],
    };
  }

  private required(files: Map<string, string>, fileName: string) {
    const content = files.get(fileName);
    if (!content) {
      throw new Error(`BMTC GTFS feed is missing required file ${fileName}.`);
    }

    return content;
  }

  private parseCsv(content: string): GtfsRecord[] {
    const rows = this.parseCsvRows(content);
    const header = rows.shift()?.map(value => value.trim()) || [];

    return rows
      .filter(row => row.some(value => value.trim()))
      .map(row => {
        const record: GtfsRecord = {};
        header.forEach((key, index) => {
          record[key] = row[index] || '';
        });
        return record;
      });
  }

  private parseCsvRows(content: string): string[][] {
    const rows: string[][] = [];
    let row: string[] = [];
    let value = '';
    let quoted = false;

    for (let index = 0; index < content.length; index++) {
      const char = content[index];
      const next = content[index + 1];

      if (char === '"' && quoted && next === '"') {
        value += '"';
        index++;
        continue;
      }

      if (char === '"') {
        quoted = !quoted;
        continue;
      }

      if (char === ',' && !quoted) {
        row.push(value);
        value = '';
        continue;
      }

      if ((char === '\n' || char === '\r') && !quoted) {
        if (char === '\r' && next === '\n') {
          index++;
        }
        row.push(value);
        rows.push(row);
        row = [];
        value = '';
        continue;
      }

      value += char;
    }

    if (value || row.length) {
      row.push(value);
      rows.push(row);
    }

    return rows;
  }

  private groupBy(records: GtfsRecord[], key: string) {
    const groups = new Map<string, GtfsRecord[]>();
    for (const record of records) {
      const group = groups.get(record[key]) || [];
      group.push(record);
      groups.set(record[key], group);
    }
    return groups;
  }

  private groupTripsByRouteDirection(trips: GtfsRecord[]) {
    const groups = new Map<string, GtfsRecord[]>();
    for (const trip of trips) {
      const directionId = trip.direction_id || '0';
      const key = `${trip.route_id}::${directionId}`;
      const group = groups.get(key) || [];
      group.push(trip);
      groups.set(key, group);
    }
    return groups;
  }

  private representativeTrip(trips: GtfsRecord[], stopTimesByTripId: Map<string, GtfsRecord[]>) {
    return trips.reduce((selected, trip) => {
      const selectedStopCount = stopTimesByTripId.get(selected.trip_id)?.length || 0;
      const stopCount = stopTimesByTripId.get(trip.trip_id)?.length || 0;
      return stopCount > selectedStopCount ? trip : selected;
    }, trips[0]);
  }

  private orderedStopTimes(stopTimes: GtfsRecord[]) {
    return [...stopTimes].sort((left, right) => Number(left.stop_sequence || 0) - Number(right.stop_sequence || 0));
  }

  private serviceClass(route: GtfsRecord): ServiceClass {
    const text = `${route.route_short_name || ''} ${route.route_long_name || ''}`.toUpperCase();

    if (text.includes('KIA') || text.includes('AIRPORT') || text.includes('VAYU VAJRA')) {
      return 'AIRPORT';
    }
    if (text.includes('MF') || text.includes('METRO FEEDER')) {
      return 'METRO_FEEDER';
    }
    if (text.includes('VAJRA') || text.includes('VOLVO')) {
      return 'PREMIUM';
    }
    if (text.includes('EXPRESS')) {
      return 'EXPRESS';
    }
    if (text.includes('NIGHT')) {
      return 'NIGHT';
    }

    return 'REGULAR';
  }

  private agencyExternalId(value: string) {
    return `bmtc:agency:${normalizeId(value || 'BMTC')}`;
  }

  private routeExternalId(routeId: string, directionId: string) {
    return `bmtc:route:${normalizeId(routeId)}:direction:${normalizeId(directionId || '0')}`;
  }

  private stopExternalId(stopId: string) {
    return `bmtc:stop:${normalizeId(stopId)}`;
  }

  private tripExternalId(tripId: string) {
    return `bmtc:trip:${normalizeId(tripId)}`;
  }

  private numberOrUndefined(value: string) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
}

export class BmtcGtfsValidator {
  validate(canonical: BmtcGtfsCanonicalOutput) {
    const errors: string[] = [];
    const warnings: string[] = [];
    const stops = new Set(canonical.nodes.map(node => node.externalId).filter(Boolean));

    if (!canonical.sourceObservations.length) {
      errors.push('No source observation exists.');
    }
    if (!canonical.agencies.length) {
      errors.push('GTFS agency.txt produced no agencies.');
    }
    if (!canonical.nodes.length) {
      errors.push('GTFS stops.txt produced no bus stops.');
    }
    if (!canonical.routePatterns.length) {
      errors.push('GTFS routes/trips produced no route patterns.');
    }
    if (!canonical.trips.length) {
      warnings.push('GTFS trips/stop_times were not imported in this run.');
    }

    for (const route of canonical.routePatterns) {
      const sequences = new Set<number>();
      if (route.stops.length < 2) {
        errors.push(`${route.longName} has fewer than two stops.`);
      }
      for (const stop of route.stops) {
        if (sequences.has(stop.sequence)) {
          errors.push(`${route.longName} contains duplicate stop sequence ${stop.sequence}.`);
        }
        sequences.add(stop.sequence);
        if (!stop.nodeExternalId || !stops.has(stop.nodeExternalId)) {
          errors.push(`${route.longName} references unknown stop ${stop.nodeExternalId || stop.name}.`);
        }
      }
    }

    for (const node of canonical.nodes) {
      if (node.latitude === undefined || node.longitude === undefined) {
        warnings.push(`${node.name} is missing coordinates.`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeId(value: string) {
  return String(value || 'unknown')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
