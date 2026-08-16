/**
 * Wire shapes for the Namma BMTC backend, transcribed from the published
 * OpenAPI 3.1 description at https://nimmbus.netlify.app.
 *
 * These are the *provider's* shapes, not ours. Nothing here should leak past
 * the mapper — canonical types live in `domain/canonical-mobility.ts`.
 *
 * Two habits of this API worth knowing before reading the rest:
 *
 *  - Every call is a POST, including the ones that read nothing. `GET` is not
 *    offered even for `GetAllServiceTypes`.
 *  - The envelope keys are misspelled at source: `issuccess`, `message` and
 *    `rowCount` appear as `issuccess`/`Message`/`RowCount` inconsistently
 *    across endpoints. [BmtcEnvelope] accepts both spellings rather than
 *    pretending the API is consistent.
 */

/** Common response envelope. Field names vary in case; see [envelopeOk]. */
export interface BmtcEnvelope {
  Issuccess?: boolean;
  issuccess?: boolean;
  isSuccess?: boolean;
  message?: string;
  Message?: string;
  rowCount?: number;
  RowCount?: number;
  responsecode?: number;
}

export function envelopeOk(body: BmtcEnvelope | null | undefined): boolean {
  if (!body) return false;
  return body.Issuccess ?? body.issuccess ?? body.isSuccess ?? false;
}

/** `/GetAllServiceTypes` — the bus classes: Ordinary, Vajra, Vayu Vajra, … */
export interface BmtcServiceType {
  servicetypeid: number;
  servicetype: string;
}

export interface BmtcServiceTypesResponse extends BmtcEnvelope {
  data?: BmtcServiceType[];
}

/**
 * `/GetAllRouteList` — one entry per *direction*.
 *
 * A route in BMTC's model is one-way: "500A UP" and "500A DOWN" are two
 * `routeid`s sharing a `routeparentid`. Canonical route patterns are also
 * directional, so this maps across without collapsing.
 */
export interface BmtcRoute {
  routeid: number;
  routeno: string;
  routename: string;
  fromstation?: string;
  fromstationid?: number;
  tostation?: string;
  tostationid?: number;
  routeparentid?: number;
}

export interface BmtcRouteListResponse extends BmtcEnvelope {
  data?: BmtcRoute[];
}

/** `/SearchRoute_v2` — resolves a displayed route number to its parent id. */
export interface BmtcRouteSearchResult {
  routeno: string;
  routeparentid: number;
}

export interface BmtcRouteSearchResponse extends BmtcEnvelope {
  data?: BmtcRouteSearchResult[];
}

/**
 * One vehicle's call at one stop, from `/SearchByRouteDetails_v4`.
 *
 * This is the richest timing BMTC publishes and the only place it gives a time
 * for an *intermediate* stop: `/GetTimetableByRouteid_v3` returns each trip's
 * first and last call only. The endpoint answers per stop rather than per trip,
 * so a trip has to be reassembled by collecting one vehicle's calls across the
 * route — see [tripsFromVehicleDetails].
 *
 * The block is a live snapshot, so it is only populated while the route is
 * running: about 58% of routes carried vehicles at 17:00 IST against 12% at
 * 22:00. An empty `vehicleDetails` means "nothing moving right now", not "no
 * timetable exists".
 *
 * `sch_*` are scheduled, `actual_*` are observed. Only the scheduled pair is
 * mapped — an observed time is a fact about one bus on one day, not a
 * timetable, and storing it as one would tell a rider a bus is due at a minute
 * it was late by once.
 */
export interface BmtcVehicleDetail {
  vehicleid?: number;
  vehiclenumber?: string;
  servicetypeid?: number;
  servicetype?: string;
  sch_arrivaltime?: string;
  sch_departuretime?: string;
  actual_arrivaltime?: string;
  actual_departuretime?: string;
  /** Distinguishes two runs by the same vehicle; see [tripsFromVehicleDetails]. */
  sch_tripstarttime?: string;
  sch_tripendtime?: string;
  centerlat?: number;
  centerlong?: number;
  eta?: string;
  heading?: number;
  lastrefreshon?: string;
}

/** One stop on a route, from `/SearchByRouteDetails_v4`. */
export interface BmtcRouteStop {
  routeid?: number;
  stationid: number;
  stationname: string;
  centerlat?: number;
  centerlong?: number;
  routeorder?: number;
  distance?: number;
  vehicleDetails?: BmtcVehicleDetail[];
}

export interface BmtcRouteDetailsResponse extends BmtcEnvelope {
  /** Present on the live variant of this call; ignored by the static import. */
  livevehicle?: unknown[];
  data?: BmtcRouteStop[];
  /** Some deployments nest the stop list here instead. */
  routedetails?: BmtcRouteStop[];
  /** Current official deployment nests each direction separately. */
  up?: { data?: BmtcRouteStop[]; mapData?: unknown[] };
  down?: { data?: BmtcRouteStop[]; mapData?: unknown[] };
}

/**
 * One scheduled trip from `/GetTimetableByRouteid_v3`.
 *
 * `starttime`/`endtime` are the trip's first and last call. `tripdetails`
 * carries the per-stop times when the operator has published them — for many
 * routes it is absent or empty, which is the whole reason Bengaluru currently
 * shows stops with no times.
 */
export interface BmtcTripStop {
  stationid?: number;
  stationname?: string;
  apptime?: string;
  routeorder?: number;
}

export interface BmtcTrip {
  tripid?: number;
  starttime?: string;
  endtime?: string;
  servicetypeid?: number;
  servicetype?: string;
  vehicleno?: string;
  tripdetails?: BmtcTripStop[];
}

export interface BmtcTimetableResponse extends BmtcEnvelope {
  data?: Array<BmtcTrip | BmtcTimetableRoute>;
  /** Seen on some routes in place of `data`. */
  timetable?: BmtcTrip[];
}

/** Current deployment wraps the individual departures in `data[].tripdetails`. */
export interface BmtcTimetableRoute {
  fromstationname?: string;
  tostationname?: string;
  fromstationid?: string | number;
  tostationid?: string | number;
  apptime?: string;
  distance?: string | number;
  platformname?: string;
  tripdetails?: BmtcTrip[];
}

export function timetableTrips(body: BmtcTimetableResponse): BmtcTrip[] {
  if (body.timetable) return body.timetable;
  const data = body.data ?? [];
  return data.flatMap((item) => {
    const wrapped = item as BmtcTimetableRoute;
    return Array.isArray(wrapped.tripdetails) && !("starttime" in item)
      ? wrapped.tripdetails
      : [item as BmtcTrip];
  });
}
