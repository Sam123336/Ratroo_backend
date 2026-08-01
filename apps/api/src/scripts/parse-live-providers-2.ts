import * as cheerio from 'cheerio';

async function main() {
  // 1. WBBustime.com
  console.log('--- FETCHING LIVE WBBUSTIME.COM ---');
  const res1 = await fetch('https://wbbustime.com', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const html1 = await res1.text();
  const $1 = cheerio.load(html1);
  const wbbustimeLinks: string[] = [];

  $1('a').each((_, el) => {
    const href = $1(el).attr('href');
    if (href && (href.includes('route') || href.includes('bus') || href.includes('stop') || href.includes('time'))) {
      wbbustimeLinks.push(href.startsWith('http') ? href : `https://wbbustime.com/${href.replace(/^\//, '')}`);
    }
  });
  console.log(`Discovered ${wbbustimeLinks.length} links on WBBustime.com`);
  console.log('Sample WBBustime links:', wbbustimeLinks.slice(0, 10));

  // 2. Bus Sathi
  console.log('\n--- FETCHING LIVE BUSSATHI.IN ---');
  const res2 = await fetch('https://bussathi.in', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
  });
  const html2 = await res2.text();
  const $2 = cheerio.load(html2);
  const bussathiLinks: string[] = [];

  $2('a').each((_, el) => {
    const href = $2(el).attr('href');
    if (href && (href.includes('route') || href.includes('bus') || href.includes('search') || href.includes('schedule'))) {
      bussathiLinks.push(href.startsWith('http') ? href : `https://bussathi.in/${href.replace(/^\//, '')}`);
    }
  });
  console.log(`Discovered ${bussathiLinks.length} links on BusSathi.in`);
  console.log('Sample BusSathi links:', bussathiLinks.slice(0, 10));
}

main().catch(console.error);
