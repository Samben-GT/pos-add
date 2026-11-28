// Daily wholesale fruit and vegetable rates for Tamil Nadu from the Government of India open data API
// (data.gov.in, Agmarknet "Current Daily Price of Various Commodities from Various Markets (Mandi)",
// Open Government Data License). Prices are rupees per quintal (100 kg) as published.
// Needs the secret DATA_GOV_IN_KEY (free key from data.gov.in); runs once a day from pg_cron.
import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import postgres from 'https://deno.land/x/postgresjs@v3.4.5/mod.js';

const sql = postgres(Deno.env.get('SUPABASE_DB_URL')!, { prepare: false, max: 2 });
const RESOURCE = '9ef84268-d588-465a-a308-a864a43d0070';
// data.gov.in publishes this sample key in its docs; it only returns a few rows, so a real key is needed for full data
const SAMPLE_KEY = '579b464db66ec23bdd000001cdd3946e44ce4aad7209ff7b23ac571b';
const PRODUCE = /tomato|onion|potato|brinjal|cabbage|carrot|beans|bhindi|ladies|cauliflower|chilli|drumstick|gourd|snakeguard|cucumber|kheera|pumpkin|raddish|radish|beetroot|capsicum|ginger|garlic|coriander|banana|apple|mango|orange|grapes|papaya|pineapple|pomegranate|guava|lemon|lime|coconut|tapioca|sweet potato|amaranthus|spinach|mint|peas|cowpea|cluster|yam|colacasia|knool|plum|watermelon|water melon|chikoos|sapota|mousambi|jack fruit|amla/i;

const day = (s: string) => { const [d, m, y] = String(s).split('/'); return `${y}-${m}-${d}`; };

Deno.serve(async req => {
  const [k] = await sql`select value from private.settings where key = 'cron_key'`;
  if ((req.headers.get('x-cron-key') || '') !== k.value) return new Response('forbidden', { status: 403 });
  const key = Deno.env.get('DATA_GOV_IN_KEY') || SAMPLE_KEY;
  let offset = 0, kept = 0, seen = 0;
  for (let page = 0; page < 20; page++) {
    const u = new URL(`https://api.data.gov.in/resource/${RESOURCE}`);
    u.searchParams.set('api-key', key);
    u.searchParams.set('format', 'json');
    u.searchParams.set('limit', '1000');
    u.searchParams.set('offset', String(offset));
    u.searchParams.set('filters[state.keyword]', 'Tamil Nadu');
    const r = await fetch(u);
    if (!r.ok) return Response.json({ error: `data.gov.in ${r.status}: ${(await r.text()).slice(0, 200)}`, kept }, { status: 502 });
    const j = await r.json();
    const recs = j.records || [];
    seen += recs.length;
    for (const x of recs) {
      if (!PRODUCE.test(x.commodity || '')) continue;
      await sql`insert into public.market_rates (arrival_date, state, district, market, commodity, variety, min_price, max_price, modal_price)
        values (${day(x.arrival_date)}, ${x.state}, ${x.district}, ${x.market}, ${x.commodity}, ${x.variety || ''},
                ${Number(x.min_price) || null}, ${Number(x.max_price) || null}, ${Number(x.modal_price) || null})
        on conflict (arrival_date, market, commodity, variety) do update set
          min_price = excluded.min_price, max_price = excluded.max_price, modal_price = excluded.modal_price, fetched_at = now()`;
      kept++;
    }
    if (recs.length < 1000 || key === SAMPLE_KEY) break;
    offset += 1000;
  }
  // keep two weeks
  await sql`delete from public.market_rates where arrival_date < current_date - 14`;
  return Response.json({ seen, kept, sample_key: key === SAMPLE_KEY });
});
