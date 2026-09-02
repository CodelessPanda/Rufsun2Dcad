# RufsunCAD Production Hardening Notes

## Build And Release

Run the frontend build from the repo root:

```bash
npm install
npm run build
```

Run the API build from the repo root:

```bash
cd server
npm install
npm run prisma:generate
npm run prisma:migrate
npm run build
```

Serve `dist/` from a static HTTPS host. Run the Nest API from `server/dist/main.js` behind an HTTPS reverse proxy.

## Required Environment

Production must set real values for:

```env
DATABASE_URL=
JWT_SECRET=
JWT_REFRESH_SECRET=
FRONTEND_URL=
GOOGLE_SOLAR_API_KEY=
```

Do not use development JWT defaults in production. Keep Google Solar, storage, JWT, and database secrets on the server only.

## Trusted Origins And Payload Limits

`FRONTEND_URL` may contain a comma-separated list of trusted frontend origins. Authenticated production CORS is origin-restricted and must not use `*`.

`REQUEST_BODY_LIMIT` controls JSON/form request body limits. `MAX_UPLOAD_BYTES` controls private asset upload size. Start with the defaults unless real projects need more.

## Object Storage

PostgreSQL stores file metadata only. Binary content belongs in object storage.

Local development uses:

```env
STORAGE_DRIVER=local
LOCAL_STORAGE_PATH=./storage
```

Production is prepared for S3-compatible storage:

```env
STORAGE_DRIVER=s3
S3_ENDPOINT=
S3_REGION=
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
```

Private files should be downloaded through protected API endpoints or short-lived signed URLs when the provider adapter supports them.

## Redis

Redis is optional locally. Set `REDIS_URL` in production when introducing shared rate-limit state, short-lived cache, or queue workers across multiple API instances.

The current local fallback is in-memory and suitable for one development process.

## Health Checks

Use:

```text
GET /api/health
GET /api/health/ready
```

`/ready` checks database availability and reports whether Redis/storage are configured without exposing secrets.

## Backups

Recommended PostgreSQL baseline:

- Daily logical backup with `pg_dump`.
- Point-in-time recovery if managed Postgres supports WAL archiving.
- Keep at least 30 days of daily backups and monthly archives for business records.
- Test restore into a non-production database before relying on backups.

Object storage:

- Enable bucket versioning where available.
- Keep lifecycle rules conservative for customer uploads, reports, images, and solar assets.
- Back up object metadata and database backups together so file records and binary objects stay consistent.

## Reverse Proxy

Run behind HTTPS. Forward `X-Request-ID` when present, preserve `Host`, and pass cookies securely. Keep request body limits aligned with `REQUEST_BODY_LIMIT`.

## Operational Logging

Logs are structured JSON and include request ID, route, status, and authenticated user ID when available. Do not log passwords, JWTs, refresh tokens, invitation tokens, storage secrets, or Google API keys.
