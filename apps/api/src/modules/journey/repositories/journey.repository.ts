import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import { Op } from 'sequelize';
import {
  PlaceAliasModel, PlaceModel,
} from '../../places/entities/place.model';
import {
  BusRouteModel, BusRouteStopModel, BusStopModel,
} from '../../provider-ingestion/infrastructure/sequelize/models';

@Injectable()
export class JourneyRepository {
  constructor(
    @InjectModel(PlaceModel) private readonly places: typeof PlaceModel,
    @InjectModel(PlaceAliasModel) private readonly aliases: typeof PlaceAliasModel,
    @InjectModel(BusStopModel) private readonly busStops: typeof BusStopModel,
    @InjectModel(BusRouteStopModel) private readonly busRouteStops: typeof BusRouteStopModel,
    @InjectModel(BusRouteModel) private readonly busRoutes: typeof BusRouteModel,
  ) {}

  /**
   * Places a name could mean, best first.
   *
   * Matching is done by the ORM; the ranking is done here in TypeScript. A
   * ranked search has no pure-ORM form — `order` would need SQL fragments
   * through `literal()`, which is raw SQL wearing a costume. Ranking a few
   * candidate rows in memory is both honest about that and easier to read: the
   * rules below are a list of reasons, in priority order.
   */
  async findPlacesByName(name: string, limit = 3): Promise<PlaceModel[]> {
    const cleanName = name.trim().toLowerCase();
    if (!cleanName) return [];

    const contains = { [Op.iLike]: `%${cleanName}%` };

    // Aliases first, so a place found only by an operator's wording — "ARAMBAG
    // (NS)", "Durgapur (Muchipara)" — is a candidate alongside the rest.
    const matchedAliases = await this.aliases.findAll({
      where: { [Op.or]: [{ normalizedAlias: contains }, { alias: contains }] },
      attributes: ['placeId', 'alias', 'normalizedAlias'],
    });

    const candidates = await this.places.findAll({
      where: {
        [Op.or]: [
          { canonicalName: contains },
          { normalizedName: contains },
          { id: { [Op.in]: matchedAliases.map(alias => alias.placeId) } },
        ],
      },
    });

    if (!candidates.length) return [];

    // Which of them buses actually leave from.
    const linked = await this.busStops.findAll({
      where: { placeId: { [Op.in]: candidates.map(place => place.id) } },
      attributes: ['placeId'],
      group: ['placeId'],
    });
    const hasServices = new Set(linked.map(stop => stop.placeId));

    const exactAlias = new Set(
      matchedAliases
        .filter(
          alias =>
            alias.normalizedAlias?.toLowerCase() === cleanName ||
            alias.alias?.toLowerCase() === cleanName,
        )
        .map(alias => alias.placeId),
    );

    return candidates
      .sort((a, b) => rank(a) - rank(b) || a.canonicalName.length - b.canonicalName.length)
      .slice(0, limit);

    /** Lower is better. Each term is a reason one place beats another. */
    function rank(place: PlaceModel): number {
      const canonical = place.canonicalName?.toLowerCase() ?? '';
      const normalized = place.normalizedName?.toLowerCase() ?? '';

      // The name the rider typed, exactly, wins first — including when they
      // typed an operator's own wording.
      if (canonical === cleanName) return 0;
      if (normalized === cleanName) return 1;
      if (exactAlias.has(place.id)) return 2;

      // Then a place buses leave from, over one that merely shares the name.
      // Geocoding created a second row for many towns — "Arambagh, Arambag,
      // Hooghly, West Bengal, 712600, India" alongside "Arambagh Bus Stand" —
      // and the address, having no stops linked to it, was winning. The
      // planner then correctly reported no route from a postcode while forty
      // services ran from the stand two rows over, and the rider was told
      // their town was not mapped.
      const serviced = hasServices.has(place.id) ? 0 : 1;
      const prefix = canonical.startsWith(cleanName) ? 0 : 1;
      const located = place.latitude != null && place.longitude != null ? 0 : 1;

      return 3 + serviced * 4 + prefix * 2 + located;
    }
  }

  async findPlaceByName(name: string): Promise<PlaceModel | null> {
    const [best] = await this.findPlacesByName(name, 1);
    return best ?? null;
  }

  /**
   * A route that calls at the origin and later at the destination.
   *
   * "Later" is the point: a route serving both places is no use if it reaches
   * the destination first. The sequence comparison that used to be a
   * self-join is done over the route-stop rows in memory.
   */
  async findConnectingRoutes(
    originPlaceId: string,
    destPlaceId: string,
  ): Promise<Array<{ id: string; longName: string; providerCode: string }>> {
    const stops = await this.busStops.findAll({
      where: { placeId: { [Op.in]: [originPlaceId, destPlaceId] } },
      attributes: ['id', 'placeId'],
    });
    if (!stops.length) return [];

    const originStops = new Set(
      stops.filter(stop => stop.placeId === originPlaceId).map(stop => stop.id),
    );
    const destStops = new Set(
      stops.filter(stop => stop.placeId === destPlaceId).map(stop => stop.id),
    );
    if (!originStops.size || !destStops.size) return [];

    const routeStops = await this.busRouteStops.findAll({
      where: { stopId: { [Op.in]: stops.map(stop => stop.id) } },
      attributes: ['routeId', 'stopId', 'sequence'],
    });

    // Earliest call at either end, per route.
    const earliest = new Map<string, { origin?: number; destination?: number }>();
    for (const routeStop of routeStops) {
      const seen = earliest.get(routeStop.routeId) ?? {};
      if (originStops.has(routeStop.stopId)) {
        seen.origin = Math.min(seen.origin ?? Infinity, routeStop.sequence);
      }
      if (destStops.has(routeStop.stopId)) {
        seen.destination = Math.max(seen.destination ?? -Infinity, routeStop.sequence);
      }
      earliest.set(routeStop.routeId, seen);
    }

    const connecting = [...earliest.entries()]
      .filter(([, seen]) =>
        seen.origin !== undefined &&
        seen.destination !== undefined &&
        seen.origin < seen.destination,
      )
      .map(([routeId]) => routeId);

    if (!connecting.length) return [];

    const routes = await this.busRoutes.findAll({
      where: { id: { [Op.in]: connecting } },
      attributes: ['id', 'longName', 'providerCode'],
      limit: 1,
    });

    return routes.map(route => ({
      id: route.id,
      longName: route.longName,
      providerCode: route.providerCode,
    }));
  }
}
