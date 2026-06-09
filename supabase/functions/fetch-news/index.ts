const ALLOWED_ORIGINS = [
  "https://app.mynumber9.uk",
  "https://master.number9-app.pages.dev",
  // *.number9-app.pages.dev
  // *.number9-admin.pages.dev
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://localhost:5178",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  return {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) || origin.endsWith('.number9-app.pages.dev') || origin.endsWith('.number9-admin.pages.dev') ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-user-token",
    "Access-Control-Allow-Credentials": "true",
  };
}

const RSS_FEEDS = [
  "https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id",
  "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",
];

async function parseRSS(xml: string): Promise<any[]> {
  const items: any[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const item = match[1];
    const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) || item.match(/<title>([^<]*)<\/title>/);
    const link = item.match(/<link>([^<]*)<\/link>/);
    const pubDate = item.match(/<pubDate>([^<]*)<\/pubDate>/);
    const description = item.match(/<description><!\[CDATA\[(.*?)\]\]><\/description>/) || item.match(/<description>([^<]*)<\/description>/);
    const source = item.match(/<source[^>]*>([^<]*)<\/source>/);
    if (title) {
      const desc = description ? description[1].replace(/<[^>]*>/g, '').slice(0, 300) : '';
      items.push({
        title: title[1],
        link: link ? link[1] : '',
        date: pubDate ? new Date(pubDate[1]).toISOString() : new Date().toISOString(),
        excerpt: desc,
        source: source ? source[1] : 'Google News',
      });
    }
  }
  return items;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "GET" && req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405, headers: corsHeaders(req) });
  }

  try {
    const results: any[] = [];
    const errors: string[] = [];

    await Promise.all(RSS_FEEDS.map(async (feedUrl) => {
      try {
        const res = await fetch(feedUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; Number9NewsBot/1.0)" },
        });
        if (!res.ok) { errors.push(`${feedUrl}: ${res.status}`); return; }
        const xml = await res.text();
        const items = await parseRSS(xml);
        results.push(...items);
      } catch (e) {
        errors.push(`${feedUrl}: ${(e as Error).message}`);
      }
    }));

    results.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return new Response(JSON.stringify({ ok: true, articles: results.slice(0, 30), errors: errors.length ? errors : undefined }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders(req) },
    });
  }
});
