const axios = require("axios");
const cheerio = require("cheerio");

const BASE_URL = "https://wbbus.in";

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function discoverAllBuses() {
  let pageUrl = `${BASE_URL}/allbus`;

  const buses = new Map();
  const visitedPages = new Set();

  let pageNumber = 1;

  while (pageUrl) {
    // Prevent accidental pagination loops
    if (visitedPages.has(pageUrl)) {
      console.log("Pagination loop detected. Stopping.");
      break;
    }

    visitedPages.add(pageUrl);

    console.log(`Fetching page ${pageNumber}`);
    console.log(pageUrl);

    const response = await axios.get(pageUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
      },
      timeout: 20000,
    });

    const $ = cheerio.load(response.data);

    let foundThisPage = 0;

    // Find every individual bus page
    $('a[href*="/bus/"]').each((_, element) => {
      const href = $(element).attr("href");

      if (!href) return;

      const url = new URL(href, BASE_URL).href;

      if (!buses.has(url)) {
        buses.set(url, {
          url,
        });

        foundThisPage++;
      }
    });

    console.log(`New buses: ${foundThisPage}`);
    console.log(`Total buses: ${buses.size}`);

    // Find the site's actual "Next" pagination link
    let nextHref = null;

    $("a").each((_, element) => {
      const text = $(element)
        .text()
        .trim()
        .toLowerCase();

      if (text.includes("next") || text.includes("»")) {
        nextHref = $(element).attr("href");
      }
    });

    if (!nextHref) {
      console.log("No next page.");
      break;
    }

    pageUrl = new URL(nextHref, pageUrl).href;

    pageNumber++;

    // Be gentle with the website
    await sleep(1500);
  }

  return Array.from(buses.values());
}

module.exports = {
  discoverAllBuses,
};
