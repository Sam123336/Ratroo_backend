import { strict as assert } from "node:assert";
import { describe, test } from "node:test";
import {
  BmtcMapper,
  BmtcRouteRecord,
  BmtcValidator,
  resolveBmtcCacheDir,
} from "./bmtc-official.provider";
import { BmtcServiceType } from "./bmtc-official.types";

/** The two the live deployment actually issues. */
const SERVICE_TYPES: BmtcServiceType[] = [
  { servicetypeid: 73, servicetype: "AC" },
  { servicetypeid: 72, servicetype: "Non AC/Ordinary" },
];

const context = {
  runId: "run-1",
  providerCode: "BMTC_OFFICIAL",
  providerVersion: "v1",
  fetchedAt: "2026-08-16T17:00:00.000Z",
};

const call = (time: string, servicetypeid = 72) => ({
  vehicleid: 1,
  vehiclenumber: "KA57F3716",
  servicetypeid,
  servicetype: servicetypeid === 73 ? "AC" : "Non AC/Ordinary",
  sch_arrivaltime: time,
  sch_departuretime: time,
  sch_tripstarttime: "15:40",
});

const record = (overrides: Partial<BmtcRouteRecord> = {}): BmtcRouteRecord => ({
  route: {
    routeid: 2101,
    routeno: "500-A UP",
    routename: "KBS-CVN",
    fromstation: "Kempegowda Bus Station",
    tostation: "Cauvery Nagara",
  },
  serviceTypes: SERVICE_TYPES,
  stops: [
    {
      stationid: 20921,
      stationname: "Kempegowda Bus Station",
      vehicleDetails: [call("15:40")],
    },
    {
      stationid: 20922,
      stationname: "Majestic",
      vehicleDetails: [call("15:43")],
    },
    {
      stationid: 20923,
      stationname: "Cauvery Nagara",
      vehicleDetails: [call("15:46")],
    },
  ],
  timetable: null,
  ...overrides,
});

describe("BMTC cache directory", () => {
  test("uses the writable system temp directory on Vercel", () => {
    assert.equal(
      resolveBmtcCacheDir({ VERCEL: "1" }, "/var/task", "/tmp"),
      "/tmp/ratroo-bmtc-cache",
    );
  });

  test("keeps the repository cache for local development", () => {
    assert.equal(
      resolveBmtcCacheDir({}, "/workspace/ratroo", "/tmp"),
      "/workspace/ratroo/.bmtc-cache",
    );
  });

  test("honours an explicit cache directory on every platform", () => {
    assert.equal(
      resolveBmtcCacheDir(
        { BMTC_CACHE_DIR: "/data/bmtc", VERCEL: "1" },
        "/var/task",
        "/tmp",
      ),
      "/data/bmtc",
    );
  });
});

describe("BMTC adapter mapper", () => {
  test("produces a canonical dataset with per-stop times", async () => {
    const dataset = await new BmtcMapper().map([record()], context);

    assert.equal(dataset.nodes.length, 3);
    assert.equal(dataset.routePatterns.length, 1);
    assert.equal(dataset.trips.length, 1);
    assert.deepEqual(
      dataset.trips[0].stopTimes.map((s) => s.departureTime),
      ["15:40", "15:43", "15:46"],
    );
    assert.equal(dataset.agencies[0].externalId, "BMTC");
  });

  test("classifies the route from the vehicles working it, not servicetypeid 0", async () => {
    // The script read `classByType.get(0)`; 0 is not an id BMTC issues, so
    // every route came out UNKNOWN.
    const regular = await new BmtcMapper().map([record()], context);
    assert.equal(regular.routePatterns[0].serviceClass, "REGULAR");

    const ac = record({
      stops: [
        { stationid: 1, stationname: "A", vehicleDetails: [call("15:40", 73)] },
        { stationid: 2, stationname: "B", vehicleDetails: [call("15:43", 73)] },
      ],
    });
    const premium = await new BmtcMapper().map([ac], context);
    assert.equal(premium.routePatterns[0].serviceClass, "PREMIUM");
  });

  test("drops a trip whose route never made it into the dataset", async () => {
    // Promotion throws on an orphan and one aborts the whole transaction, so
    // nothing at all reaches the rider-facing tables. A route can fail its stop
    // lookup while its timetable call still succeeds.
    const orphan = record({
      stops: [],
      timetable: {
        Issuccess: true,
        data: [{ tripdetails: [{ starttime: "07:40", endtime: "08:35" }] }],
      },
    });
    const dataset = await new BmtcMapper().map([orphan, record()], context);

    assert.equal(dataset.routePatterns.length, 1);
    assert.ok(
      dataset.trips.every((t) => t.routeExternalId === "2101"),
      "no trip may reference a route with no pattern",
    );
  });
});

describe("BMTC adapter validator", () => {
  test("fails a crawl that returned no stops at all", async () => {
    const result = await new BmtcValidator().validate([record({ stops: [] })]);
    assert.equal(result.isValid, false);
    assert.match(result.errors.join(" "), /no route returned any stop/i);
  });

  test("warns rather than fails when nothing was running", async () => {
    // vehicleDetails is a live snapshot — a 23:00 run legitimately sees an
    // empty network, and failing the run would make the harvest look broken.
    const quiet = record({
      stops: [{ stationid: 1, stationname: "A", vehicleDetails: [] }],
    });
    const result = await new BmtcValidator().validate([quiet]);

    assert.equal(result.isValid, true);
    assert.match(result.warnings.join(" "), /per-stop times will be absent/i);
  });

  test("rejects an empty crawl", async () => {
    const result = await new BmtcValidator().validate([]);
    assert.equal(result.isValid, false);
  });
});
