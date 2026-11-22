# Store POS: shop link

Installable web app (Chrome "Install app") for shop staff to add products: 1 to 4 photos, quantity, selling price
(required), buying price and source (optional). Products wait on the phone until they upload, so weak internet is fine.
"My products" shows what this phone added and whether it is uploaded, catalogued or already in the shop app.

Link per shop: `https://samben-gt.github.io/pos-add/?s=<store code>`

## Flow

1. Shop link uploads to Supabase (`submit_product`, photos to the private `photos` bucket, `finish_product`).
2. Overnight, the `catalogue` edge function reads the photos with a vision model and fills name, brand, size,
   category, type and the barcode number when readable.
3. The Store POS Android app (Settings > Shop link) collects catalogued products through the `collect` edge
   function, saves them into its Excel file and phone storage, then deletes them from Supabase.

## Security

- `config.js` holds the public anon key. The browser has no table access; it can only call the functions
  above and add photos to a product that is still uploading.
- The POS app authenticates with a per-store key (only its sha256 is stored in `public.stores`).
- The catalogue function is called by pg_cron with a key kept in `private.settings`.
