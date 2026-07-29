const fs = require("fs");
const path = require("path");

function createRouteFingerprint(stops) {
  return stops
    .map(stop =>
      stop.name
        .toLowerCase()
        .trim()
        .replace(/\s+/g, " ")
    )
    .join("|");
}

function processRoutes() {
  const dataDir = path.join(__dirname, "..", "data");
  const busesFilePath = path.join(dataDir, "buses.json");

  if (!fs.existsSync(busesFilePath)) {
    console.error("data/buses.json does not exist. Please run the full scraper first.");
    return;
  }

  const buses = JSON.parse(fs.readFileSync(busesFilePath, "utf8"));
  console.log(`Loaded ${buses.length} buses from data/buses.json`);

  const routes = [];
  const stopMap = new Map(); // name -> { id, name, count }
  let stopIdCounter = 1;

  function getOrCreateStop(name) {
    const normalized = name.trim().replace(/\s+/g, " ");
    const key = normalized.toLowerCase();

    if (!stopMap.has(key)) {
      const stopId = `STOP_${String(stopIdCounter++).padStart(5, "0")}`;
      stopMap.set(key, {
        id: stopId,
        name: normalized,
        count: 1,
      });
    } else {
      stopMap.get(key).count++;
    }

    return stopMap.get(key);
  }

  for (const bus of buses) {
    if (!bus.schedule || bus.schedule.length < 2) {
      continue;
    }

    const reg = bus.registration || bus.registrationNumber || null;

    // --- UP Direction ---
    const upStopsRaw = bus.schedule.filter(s => s.stoppageName && s.stoppageName.trim());
    if (upStopsRaw.length >= 2) {
      const upStops = upStopsRaw.map((stop, index) => {
        const canonicalStop = getOrCreateStop(stop.stoppageName);
        return {
          sequence: index + 1,
          stopId: canonicalStop.id,
          name: canonicalStop.name,
          time: (stop.upTime && stop.upTime !== "_ _ : _ _") ? stop.upTime : null,
        };
      });

      const upFingerprint = createRouteFingerprint(upStops);

      routes.push({
        busName: bus.name,
        registrationNumber: reg,
        direction: "UP",
        fingerprint: upFingerprint,
        origin: upStops[0].name,
        destination: upStops[upStops.length - 1].name,
        stops: upStops,
      });
    }

    // --- DOWN Direction ---
    const downStopsRaw = [...bus.schedule]
      .reverse()
      .filter(s => s.stoppageName && s.stoppageName.trim());

    if (downStopsRaw.length >= 2) {
      const downStops = downStopsRaw.map((stop, index) => {
        const canonicalStop = getOrCreateStop(stop.stoppageName);
        return {
          sequence: index + 1,
          stopId: canonicalStop.id,
          name: canonicalStop.name,
          time: (stop.downTime && stop.downTime !== "_ _ : _ _") ? stop.downTime : null,
        };
      });

      const downFingerprint = createRouteFingerprint(downStops);

      routes.push({
        busName: bus.name,
        registrationNumber: reg,
        direction: "DOWN",
        fingerprint: downFingerprint,
        origin: downStops[0].name,
        destination: downStops[downStops.length - 1].name,
        stops: downStops,
      });
    }
  }

  // Deduplicate unique route patterns
  const uniqueRoutePatterns = new Map();
  for (const r of routes) {
    if (!uniqueRoutePatterns.has(r.fingerprint)) {
      uniqueRoutePatterns.set(r.fingerprint, {
        patternId: `PATTERN_${String(uniqueRoutePatterns.size + 1).padStart(5, "0")}`,
        origin: r.origin,
        destination: r.destination,
        stopCount: r.stops.length,
        stops: r.stops.map(s => ({ sequence: s.sequence, stopId: s.stopId, name: s.name })),
        servicedByBuses: [],
      });
    }
    uniqueRoutePatterns.get(r.fingerprint).servicedByBuses.push({
      busName: r.busName,
      registrationNumber: r.registrationNumber,
      direction: r.direction,
    });
  }

  // Convert stop map to sorted array
  const stops = Array.from(stopMap.values()).map(s => ({
    id: s.id,
    name: s.name,
    routeOccurrences: s.count,
    lat: null,
    lng: null,
  }));

  // Save files
  fs.writeFileSync(
    path.join(dataDir, "routes.json"),
    JSON.stringify(routes, null, 2)
  );

  fs.writeFileSync(
    path.join(dataDir, "route-patterns.json"),
    JSON.stringify(Array.from(uniqueRoutePatterns.values()), null, 2)
  );

  fs.writeFileSync(
    path.join(dataDir, "stops.json"),
    JSON.stringify(stops, null, 2)
  );

  console.log("\n=================================");
  console.log("ROUTE & STOP TRANSFORMATION COMPLETE");
  console.log("=================================");
  console.log(`Total Directional Routes Created: ${routes.length}`);
  console.log(`Unique Route Patterns: ${uniqueRoutePatterns.size}`);
  console.log(`Master Canonical Stops Extracted: ${stops.length}`);
  console.log("Saved → data/routes.json");
  console.log("Saved → data/route-patterns.json");
  console.log("Saved → data/stops.json");
}

processRoutes();
