import * as cheerio from 'cheerio';

async function main() {
  console.log('Fetching live URLs from wbbus.in/allbus...');
  const res = await fetch('https://wbbus.in/allbus', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const links: string[] = [];

  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && (href.includes('/bus/') || href.includes('route') || href.includes('detail'))) {
      links.push(href.startsWith('http') ? href : `https://wbbus.in${href}`);
    }
  });

  console.log(`Found ${links.length} live bus links on wbbus.in!`);
  console.log('Sample links:', links.slice(0, 10));

  if (links.length > 0) {
    const detailRes = await fetch(links[0], {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
    });
    const detailHtml = await detailRes.text();
    const $d = cheerio.load(detailHtml);
    console.log(`\nSample Detail Page (${links[0]}):`);
    console.log('Title:', $d('title').text().trim());
    console.log('H1:', $d('h1').text().trim());

    const stops: string[] = [];
    $d('li, tr, td, .stop, .stoppage').each((_, el) => {
      const text = $d(el).text().trim();
      if (text && text.length > 2 && text.length < 60 && !text.includes('\n')) {
        stops.push(text);
      }
    });
    console.log('Discovered Stops on detail page:', stops.slice(0, 15));
  }
}

main().catch(console.error);
