# RufsunCAD - Exact Startup Steps After Each Phase

Use these steps after every completed phase or after pulling new code.

## 1. Start PostgreSQL

From the project root:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run db:up
```

If Docker is not used, start your local PostgreSQL service manually and make sure `server/.env` points to the correct database.

## 2. Install Dependencies

Root frontend dependencies:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm install
```

Backend dependencies:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad\server
npm install
```

## 3. Check Backend Environment

Create `server/.env` if missing:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad\server
copy .env.example .env
```

Minimum required values:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/rufsun_cad?schema=public"
JWT_SECRET="replace-with-a-long-random-access-token-secret"
JWT_REFRESH_SECRET="replace-with-a-long-random-refresh-token-secret"
FRONTEND_URL="http://localhost:5173"
PORT=4000
GOOGLE_MAPS_BROWSER_KEY=""
GOOGLE_SOLAR_API_KEY=""
```

## 4. Generate Prisma Client

```bash
cd E:\xampp\htdocs\Rufsun2Dcad\server
npm run prisma:generate
```

## 5. Apply Migrations

Do not use `prisma migrate reset` unless you intentionally want to delete development data.

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run server:migrate
```

## 6. Seed Demo Data

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run server:seed
```

Seed accounts:

```text
Demo user: demo@rufsun.local / Demo12345
Super admin: admin@rufsun.local / Admin12345
```

## 7. Start Backend

Terminal 1:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run server:dev
```

Backend API:

```text
http://localhost:4000/api
```

## 8. Start Frontend

Terminal 2:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run dev
```

Frontend app:

```text
http://localhost:5173
```

## 9. Validation Commands

Run these after major changes:

```bash
cd E:\xampp\htdocs\Rufsun2Dcad
npm run test
npm run build
npm run server:test
npm run server:build
```

## 10. Common Login Fixes

If login fails after a phase:

- Confirm PostgreSQL is running.
- Confirm `server/.env` has `DATABASE_URL`.
- Run `npm run server:migrate`.
- Run `npm run server:seed`.
- Confirm backend is running on `http://localhost:4000/api`.
- Confirm frontend is running on `http://localhost:5173`.
- Use the seeded credentials exactly as shown above.
