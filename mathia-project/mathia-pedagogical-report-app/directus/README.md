# Directus

Directus manages authentication, roles, permissions and CRUD. PostgreSQL owns the business tables and integrity constraints.

After local startup, open http://localhost:8055 using DIRECTUS_ADMIN_EMAIL and DIRECTUS_ADMIN_PASSWORD from .env.

bootstrap/bootstrap.mjs registers collections, relations, roles and policies from manifest.mjs. seed.mjs creates fictional local test accounts and assignments. The directus-bootstrap Compose service runs both before the SPA starts.

Migrations add links to Directus system tables after those tables exist. Policies scope access by school, profile and class assignments. Uploads and snapshots use Docker volumes.

From bootstrap/, run `npm test` and `npm run validate` to check the manifest.
