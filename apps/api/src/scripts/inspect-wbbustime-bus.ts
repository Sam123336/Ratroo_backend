import * as cheerio from 'cheerio';

async function main() {
  const url = 'https://wbbustime.com/bus/2941/new-joy-maa-kali-travels';
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const html = await res.text();
  const $ = cheerio.load(html);

  console.log('--- ALL TEXT CONTAINERS ---');
  $('div, p, span, li, a').each((_, el) => {
    const text = $(el).text().trim();
    if (text.includes('Stoppages') || text.includes('Departure') || text.includes('Arrival') || text.includes('Nandigram') || text.includes('Kalyani') || text.includes('Time')) {
      if (text.length < 200) {
        console.log(`[${el.tagName}]:`, text.replace(/\s+/g, ' '));
      }
    }
  });
}

main().catch(console.error);
