const fs = require("fs");
const path = require("path");
const { scrapeBus } = require("./scrapeBus");

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function scrapeBusWithRetry(url, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await scrapeBus(url);
    } catch (err) {
      if (err.response && err.response.status === 429) {
        const waitTime = attempt * 3000;
        console.warn(`[429 Rate Limit] Waiting ${waitTime}ms before retry ${attempt}/${maxRetries} for ${url}`);
        await sleep(waitTime);
      } else {
        if (attempt === maxRetries) throw err;
        await sleep(1000);
      }
    }
  }
}

async function fetchAllBuses() {
  const dataDir = path.join(__dirname, "..", "data");
  const busUrlsFile = path.join(dataDir, "bus-urls.json");

  if (!fs.existsSync(busUrlsFile)) {
    console.error("data/bus-urls.json not found! Run discovery first.");
    return;
  }

  const busEntries = JSON.parse(fs.readFileSync(busUrlsFile, "utf8"));
  console.log(`Found ${busEntries.length} bus URLs in data/bus-urls.json`);

  const results = [];
  const total = busEntries.length;

  for (let i = 0; i < total; i++) {
    const item = busEntries[i];
    if ((i + 1) % 25 === 0 || i === 0 || i === total - 1) {
      console.log(`Progress: [${i + 1}/${total}] scraping ${item.url}...`);
    }

    try {
      const busData = await scrapeBusWithRetry(item.url);
      results.push(busData);
    } catch (err) {
      console.error(`Failed ${item.url}: ${err.message}`);
    }

    // Polite delay between requests
    await sleep(400);
  }

  fs.writeFileSync(
    path.join(dataDir, "buses.json"),
    JSON.stringify(results, null, 2)
  );

  console.log(`\nSuccessfully scraped ${results.length}/${total} buses and saved to data/buses.json!`);
}

if (require.main === module) {
  fetchAllBuses();
}

module.exports = {
  fetchAllBuses,
};
