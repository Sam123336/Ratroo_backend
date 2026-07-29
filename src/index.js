const fs = require("fs");
const path = require("path");
const { discoverAllBuses } = require("./discover");

async function main() {
  try {
    const buses = await discoverAllBuses();

    const dataDir = path.join(__dirname, "..", "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    fs.writeFileSync(
      path.join(dataDir, "bus-urls.json"),
      JSON.stringify(buses, null, 2)
    );

    console.log("\n======================");
    console.log("DISCOVERY COMPLETE");
    console.log("======================");

    console.log(`Total buses: ${buses.length}`);
    console.log("Saved → data/bus-urls.json");

  } catch (error) {
    console.error("Crawler failed:");
    console.error(error.message);
  }
}

main();
