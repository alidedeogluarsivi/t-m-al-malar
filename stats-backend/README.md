# Shared visitor and recent-search API
GitHub Pages cannot persist shared counters. Deploy this Cloudflare Worker with D1.
1. Create a Cloudflare account and install Wrangler.
2. Run `npx wrangler d1 create alidedeoglu-arsiv-stats`, copy database_id into wrangler.toml.
3. Run `npx wrangler d1 execute alidedeoglu-arsiv-stats --remote --file=./schema.sql` in this folder.
4. Run `npx wrangler deploy` in this folder.
5. Add `<script>window.ARCHIVE_STATS_API="https://YOUR-WORKER.workers.dev"</script>` before site-stats.js in index.html and update the visitor counter to use the same endpoint.
6. Test GET /api/site-stats and POST { "type": "visit" }, { "type": "village", "name": "..." }.
Historical countapi totals cannot be reconstructed without their original provider data.
Do not expose Cloudflare API tokens in this repository.
