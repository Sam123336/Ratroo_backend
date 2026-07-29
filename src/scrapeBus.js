const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeBus(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(response.data);

  const details = {};
  $("table.table-striped tr").each((_, row) => {
    const cols = $(row).find("td");
    if (cols.length >= 2) {
      const key = $(cols[0]).text().replace(":", "").trim();
      const val = $(cols[1]).text().replace(/\s+/g, " ").trim();
      details[key] = val;
    }
  });

  const schedule = [];
  $(".row.sud").each((_, row) => {
    const cols = $(row).find("div");
    if (cols.length >= 4) {
      const slNo = $(cols[0]).text().trim();
      const upTime = $(cols[1]).text().trim();
      const stoppageName = $(cols[2]).text().trim();
      const downTime = $(cols[3]).text().trim();
      schedule.push({ slNo, upTime, stoppageName, downTime });
    }
  });

  let notes = null;
  $(".card").each((_, card) => {
    const header = $(card).find(".card-header").text().trim();
    if (header.includes("Bus Notes")) {
      notes = $(card).find(".card-body").text().trim();
    }
  });

  const bus = {
    source: "WBBUS",
    sourceUrl: url,
    name: details["Bus Name"] || null,
    alternateName: details["Alternate Name"] || null,
    agencyName: details["Agency Name"] || null,
    registration: details["Registration Number"] || null,
    busType: details["Bus Type"] || null,
    contactNumber: details["Contact Number"] || null,
    alternateNumber: details["Alternate Number"] || null,
    origin: details["Depot Name"] || null,
    destination: details["Destination"] || null,
    uploadedBy: details["Upload By"] || null,
    schedule,
    notes,
    scrapedAt: new Date().toISOString(),
  };

  return bus;
}

module.exports = {
  scrapeBus,
};

