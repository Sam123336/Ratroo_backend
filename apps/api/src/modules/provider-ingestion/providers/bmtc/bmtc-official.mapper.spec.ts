import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";
import {
  BMTC_PROVIDER_CODE,
  normalizeTime,
  serviceClassFor,
  serviceClassLookup,
  toNode,
  toRoutePattern,
  toTrip,
  tripsFromVehicleDetails,
} from "./bmtc-official.mapper";
import {
  BmtcRouteDetailsResponse,
  BmtcRouteStop,
  BmtcRouteListResponse,
  BmtcServiceTypesResponse,
  BmtcTimetableResponse,
  envelopeOk,
  timetableTrips,
} from "./bmtc-official.types";

/**
 * The upstream host is unreachable from CI, so the fixtures are the contract.
 * They are schema-derived, not captured — see the fixtures README for what
 * that does and does not prove.
 */
const DIR = join(
  __dirname,
  "../../../../../../../providers/karnataka/bengaluru/bmtc-official/v1/fixtures",
);
const load = <T>(name: string): T =>
  JSON.parse(readFileSync(join(DIR, name), "utf8")) as T;

const serviceTypes = load<BmtcServiceTypesResponse>("service-types.json");
const routeList = load<BmtcRouteListResponse>("route-list.json");
const routeDetails = load<BmtcRouteDetailsResponse>("route-details-2101.json");
const timetable = load<BmtcTimetableResponse>("timetable-2101.json");

const route500A = routeList.data!.find((r) => r.routeid === 2101)!;

describe("BMTC envelope", () => {
  test("reads the misspelled success flag the API actually sends", () => {
    assert.equal(envelopeOk(serviceTypes), true);
    assert.equal(envelopeOk({ Issuccess: true }), true);
    assert.equal(envelopeOk({ isSuccess: true }), true);
    assert.equal(envelopeOk({}), false);
    assert.equal(envelopeOk(null), false);
  });
});

describe("service classes", () => {
  test("checks Vayu Vajra before Vajra", () => {
    // "Vayu Vajra" contains "Vajra", so a naive rule files every airport
    // service as PREMIUM and shows the rider the wrong fare.
    assert.equal(serviceClassFor("Vayu Vajra"), "AIRPORT");
    assert.equal(serviceClassFor("VAYUVAJRA"), "AIRPORT");
    assert.equal(serviceClassFor("Vajra"), "PREMIUM");
  });

  test("maps the classes BMTC actually publishes", () => {
    const byId = serviceClassLookup(serviceTypes.data!);
    assert.equal(byId.get(1), "REGULAR");
    assert.equal(byId.get(2), "PREMIUM");
    assert.equal(byId.get(3), "AIRPORT");
    assert.equal(byId.get(4), "METRO_FEEDER");
    assert.equal(byId.get(5), "EXPRESS");
  });

  test("says UNKNOWN rather than guessing REGULAR", () => {
    assert.equal(serviceClassFor("Chartered Contract"), "UNKNOWN");
    assert.equal(serviceClassFor(""), "UNKNOWN");
    assert.equal(serviceClassFor(undefined), "UNKNOWN");
  });
});

describe("stops", () => {
  const stops = routeDetails.data!;

  test("keeps coordinates when the operator surveyed the stop", () => {
    const node = toNode(stops.find((s) => s.stationid === 5001)!);
    assert.equal(node.providerCode, BMTC_PROVIDER_CODE);
    assert.equal(node.nodeType, "BUS_STOP");
    assert.ok(Math.abs(node.latitude! - 12.9507) < 1e-6);
    assert.equal(node.confidence, 0.9);
  });

  test("drops 0,0 rather than plotting a stop in the Gulf of Guinea", () => {
    const node = toNode(stops.find((s) => s.stationid === 5007)!);
    assert.equal(node.latitude, undefined);
    assert.equal(node.longitude, undefined);
    // Still a real stop, just unplottable — kept, at lower confidence.
    assert.equal(node.name, "Kalasipalya");
    assert.equal(node.confidence, 0.6);
  });
});

describe("route patterns", () => {
  test("renumbers a gappy routeorder into a dense sequence", () => {
    // BMTC sends 1, 3, 7, 9. Left as-is, a "next stop" lookup skips stops.
    const pattern = toRoutePattern(route500A, routeDetails.data!, "REGULAR");
    assert.deepEqual(
      pattern.stops.map((s) => s.sequence),
      [1, 2, 3, 4],
    );
    assert.deepEqual(
      pattern.stops.map((s) => s.name),
      ["Shanthinagara Bus Station", "Town Hall", "Kalasipalya", "KR Market"],
    );
  });

  test("keeps the two directions apart but linked by routeparentid", () => {
    const up = routeList.data!.find((r) => r.routeid === 2101)!;
    const down = routeList.data!.find((r) => r.routeid === 2102)!;
    assert.equal(up.routeparentid, down.routeparentid);
    assert.notEqual(
      toRoutePattern(up, []).externalId,
      toRoutePattern(down, []).externalId,
    );
  });
});

describe("times", () => {
  test("accepts every spelling BMTC uses for one clock time", () => {
    assert.equal(normalizeTime("06:15"), "06:15");
    assert.equal(normalizeTime("6:32"), "06:32");
    assert.equal(normalizeTime("0648"), "06:48");
    assert.equal(normalizeTime("24:10"), "24:10"); // after-midnight service
  });

  test("rejects nonsense instead of coercing it", () => {
    assert.equal(normalizeTime(""), undefined);
    assert.equal(normalizeTime("99:99"), undefined);
    assert.equal(normalizeTime("soon"), undefined);
    assert.equal(normalizeTime(undefined), undefined);
  });
});

describe("trips", () => {
  const trips = timetableTrips(timetable);

  test("maps published per-stop times and never marks them estimated", () => {
    const trip = toTrip(route500A, trips[0], 0, "REGULAR")!;
    assert.equal(trip.stopTimes.length, 4);
    assert.deepEqual(
      trip.stopTimes.map((s) => s.departureTime),
      ["06:15", "06:32", "06:48", "07:05"],
    );
    // BMTC's own times. Flagging them estimated would caption a published
    // departure as a guess.
    assert.ok(trip.stopTimes.every((s) => s.timeIsEstimated === false));
    assert.equal(trip.vehicleRegistration, "KA01FA1234");
  });

  test("keeps first and last call when the per-stop detail is missing", () => {
    // Half a timetable beats none, and the gap shows as absent stops rather
    // than invented ones.
    const trip = toTrip(route500A, trips[1], 1)!;
    assert.equal(trip.stopTimes.length, 2);
    assert.equal(trip.stopTimes[0].departureTime, "07:40");
    assert.equal(trip.stopTimes[1].arrivalTime, "08:35");
    assert.equal(trip.serviceClass, "PREMIUM");
  });

  test("drops a trip with no usable time at all", () => {
    // Emitting it would inflate the route trip count while telling a rider nothing.
    assert.equal(toTrip(route500A, trips[2], 2), null);
  });
});

/**
 * Shapes here are copied from live `/SearchByRouteDetails_v4` responses in
 * `.bmtc-cache`, not derived from the spec — the spec does not document
 * `vehicleDetails` at all, and it is the only intermediate-stop timing BMTC
 * publishes.
 */
describe("trips from vehicleDetails", () => {
  const vehicle = (
    id: number,
    time: string,
    tripStart: string,
    servicetype = "Non AC/Ordinary",
  ) => ({
    vehicleid: id,
    vehiclenumber: `KA57F${3700 + id}`,
    servicetypeid: servicetype === "AC" ? 73 : 72,
    servicetype,
    sch_arrivaltime: time,
    sch_departuretime: time,
    sch_tripstarttime: tripStart,
  });

  const stopsWith = (
    calls: Array<Array<ReturnType<typeof vehicle>>>,
  ): BmtcRouteStop[] =>
    calls.map((vehicleDetails, i) => ({
      stationid: 20900 + i,
      stationname: `Stop ${i + 1}`,
      vehicleDetails,
    }));

  test("transposes per-stop vehicle calls into a per-stop timed trip", () => {
    const stops = stopsWith([
      [vehicle(1, "15:40", "15:40")],
      [vehicle(1, "15:43", "15:40")],
      [vehicle(1, "15:46", "15:40")],
    ]);
    const [trip] = tripsFromVehicleDetails(route500A, stops);

    assert.deepEqual(
      trip.stopTimes.map((s) => s.departureTime),
      ["15:40", "15:43", "15:46"],
    );
    // Every call binds to a real station id — this is what the intermediate
    // stops were missing.
    assert.deepEqual(
      trip.stopTimes.map((s) => s.stopExternalId),
      ["20900", "20901", "20902"],
    );
    assert.ok(trip.stopTimes.every((s) => s.timeIsEstimated === false));
    assert.equal(trip.serviceClass, "REGULAR");
    assert.equal(trip.vehicleRegistration, "KA57F3701");
  });

  test("splits two runs by the same bus on sch_tripstarttime", () => {
    // Keyed on the vehicle alone these interleave into one trip whose times
    // zig-zag 18:50, 20:05, 18:51, 20:06.
    const stops = stopsWith([
      [vehicle(2, "18:50", "18:50"), vehicle(2, "20:05", "20:05")],
      [vehicle(2, "20:06", "20:05"), vehicle(2, "18:51", "18:50")],
      [vehicle(2, "18:53", "18:50"), vehicle(2, "20:08", "20:05")],
    ]);
    const trips = tripsFromVehicleDetails(route500A, stops);

    assert.equal(trips.length, 2);
    const times = trips
      .map((t) => t.stopTimes.map((s) => s.departureTime))
      .sort();
    assert.deepEqual(times, [
      ["18:50", "18:51", "18:53"],
      ["20:05", "20:06", "20:08"],
    ]);
  });

  test("drops the one backwards call, not the whole trip", () => {
    const stops = stopsWith([
      [vehicle(3, "18:00", "18:00")],
      [vehicle(3, "18:01", "18:00")],
      [vehicle(3, "17:52", "18:00")], // observed on route 253-B
      [vehicle(3, "18:02", "18:00")],
    ]);
    const [trip] = tripsFromVehicleDetails(route500A, stops);

    assert.deepEqual(
      trip.stopTimes.map((s) => s.departureTime),
      ["18:00", "18:01", "18:02"],
    );
    // Sequence is renumbered over what survived, so the composite key
    // `${tripExternalId}:${sequence}` the import service builds stays unique.
    assert.deepEqual(
      trip.stopTimes.map((s) => s.sequence),
      [1, 2, 3],
    );
  });

  test("keeps only the calls a mid-route snapshot actually timed", () => {
    // A bus caught mid-route reports blanks for stops it has not been given
    // times for. Filling them is what interpolation is for, and it labels them.
    const stops = stopsWith([
      [{ ...vehicle(4, "", "19:03"), sch_arrivaltime: "", sch_departuretime: "" }],
      [vehicle(4, "19:03", "19:03")],
      [vehicle(4, "19:04", "19:03")],
    ]);
    const [trip] = tripsFromVehicleDetails(route500A, stops);

    assert.equal(trip.stopTimes.length, 2);
    assert.equal(trip.stopTimes[0].stopName, "Stop 2");
  });

  test("ignores a lone call and a route with nothing running", () => {
    assert.deepEqual(
      tripsFromVehicleDetails(route500A, stopsWith([[vehicle(5, "10:00", "10:00")], []])),
      [],
    );
    assert.deepEqual(tripsFromVehicleDetails(route500A, stopsWith([[], []])), []);
  });
});

describe("current official timetable envelope", () => {
  test("unwraps departures nested under data[].tripdetails", () => {
    const body: BmtcTimetableResponse = {
      Issuccess: true,
      data: [{ tripdetails: [{ starttime: "17:25", endtime: "18:05" }] }],
    };
    assert.deepEqual(timetableTrips(body), [
      { starttime: "17:25", endtime: "18:05" },
    ]);
  });
});
