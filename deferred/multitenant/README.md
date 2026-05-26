# Multi-tenant work (deferred)

Held until after stock-unit / reporting release.

Files here were removed from the active app so `npm run build` stays single-tenant:

- `migrate-to-multitenant.ts` — data backfill script
- `prisma-tenant.ts` — Prisma client extension
- `tenant-context.ts` — session tenant resolver stub

Restore and wire when ready to ship tenant isolation.
