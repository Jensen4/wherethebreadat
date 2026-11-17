# Where The Bread At

Financial tracker with a React + TypeScript frontend and a separate FastAPI backend.

The API includes registration/login, user-owned paystubs and payments, input validation,
pagination, and interactive API documentation. Amounts are integer cents; currency defaults
to CAD. Paystubs are entered manually; attachments and OCR are future work.

## Local setup

For everyday personal use, run this from the repository root:

```sh
./start.sh
```

The launcher checks prerequisites, installs missing dependencies, creates missing local
configuration, starts Docker Desktop on macOS if needed, waits for PostgreSQL, creates
missing tables, cleans expired security records, starts both servers on localhost, and
opens http://127.0.0.1:5173. First-time setup can take a few minutes; later runs are faster.
Use `./start.sh --no-open` to skip opening the browser. You do not need to activate the
Python virtual environment first, and the script works from any working directory.

Keep its terminal open. Ctrl+C stops both app servers and leaves PostgreSQL and your data
intact. To stop PostgreSQL too, run `docker compose stop db`. Logs are in `.run/backend.log`
and `.run/frontend.log`. If ports 8000 or 5173 are occupied, stop your separately started
servers first; the launcher never kills other processes. The frontend reloads as you edit;
restart the launcher after backend changes. This launches a local app, not a public website.

Manual setup follows if you prefer running each service yourself.

Requires Python 3.11+ and Docker Compose for PostgreSQL.

PostgreSQL is exposed on `127.0.0.1:5433` to avoid conflicts with an existing local
PostgreSQL server. If you already have `backend/.env`, update its `DATABASE_URL` port
to `5433` to match `compose.yaml`.

From the repository root (Python 3.11+):

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -e '.[dev]'
cd ..
python backend/scripts/setup_local.py
docker compose up -d db
```

The setup script generates random passwords in ignored root/backend `.env` files with
owner-only permissions. It does not print credentials. It is for this project's local
Docker database, not a production database. Do not copy the placeholder environment
files over these generated files.

**If your database already existed before the security update**, run this once after
starting the container. It preserves records, rotates administrator credentials, disables
the old `bread` login, and creates restricted application/migration roles:

```sh
python backend/scripts/secure_local_db.py
```

Then create missing tables and start the backend:

```sh
cd backend
python -m app.db
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000 --no-proxy-headers
```

`DATABASE_URL` uses `bread_app`, which can read/write records but cannot create tables,
create databases, or manage roles. `MIGRATION_DATABASE_URL` uses `bread_migrator`, which
owns the tables and is used only by `python -m app.db`. The administrator password lives
in the root Docker environment file, not the backend environment file.

Open http://127.0.0.1:5173 for the app after starting the frontend below.
API documentation is at http://127.0.0.1:8000/docs. The auth API accepts JSON email/password
(12–128 characters). Mutations require `X-CSRF-Protection: 1`; authenticated mutations also
require `X-CSRF-Token` from the login or session response. Swagger's default Try It Out
interface does not automatically attach these CSRF headers; use the frontend or an API
client configured with these headers and a cookie jar.

## Frontend

Requires Node.js 22.12+ (or 20.19+). With the backend running, open a second terminal:

```sh
cd frontend
npm install
npm run dev
```

Open http://127.0.0.1:5173. Create an account or sign in, then add paystubs and payments.

Pages have their own URLs: `/overview`, `/paystubs`, `/payments`, and `/settings`.
Sign-in and account creation use `/login` and `/register`. Signed-out visitors default
to `/login`; private page links preserve their destination through sign-in. Signed-in
visitors default to `/overview` and are redirected away from the auth pages. Browser
back/forward navigation works between pages. Vite serves these
URLs in development and preview. When hosting the production build, configure the
web server to serve `index.html` for page paths (for example, Nginx
`try_files $uri $uri/ /index.html;`), while routing `/api` to the backend.
The React + TypeScript app uses Vite, custom responsive CSS, and Lucide icons. It includes
a monthly overview, six-month income/payment chart, currency selection, searchable
records, payment status filters, create/edit/delete forms, and marking payments paid.

Vite proxies `/api` to http://127.0.0.1:8000 in development. No frontend `.env` is required.
Prefer serving the frontend and `/api` behind the same HTTPS origin in production.
If using an API subdomain on the same site, set `VITE_API_URL` to its HTTPS origin at build
time and allow the frontend origin in backend `CORS_ORIGINS`. Completely different sites
are intentionally unsupported by the Strict SameSite cookie. If leaving the URL empty in production,
configure your web server to proxy `/api`; Vite's development proxy is not part of the build.
All `VITE_*` variables are public. Never put backend secrets in the frontend environment.

Authentication uses a random opaque session cookie with HttpOnly and SameSite=Strict;
production adds Secure and the `__Host-` cookie prefix. Only a SHA-256 hash of the
authentication token is stored in PostgreSQL. Credentials are never stored in browser
local/session storage. The frontend restores identity via `/api/auth/session` and keeps
the CSRF token in memory. Sessions expire after 60 minutes and are revoked immediately
by server-side logout or replaced login. Existing JWTs are no longer accepted.
The app fetches all API pages for complete summaries. For larger datasets, move summaries
and filtering to dedicated backend endpoints.

The overview counts paystubs by pay date, paid expenses by paid date, and pending bills by
due date within the selected month. The payments view follows the same convention.
Remaining income is not a bank balance, and different currencies are never combined.
Paystub entry is manual; document uploads and OCR are not implemented.

Frontend checks (from `frontend/`):

```sh
npm test
npm run build
```

Google Fonts supplies DM Sans and Manrope, with local sans-serif fallbacks when offline.

## API

| Path                 | Methods          | Purpose                                               |
| -------------------- | ---------------- | ----------------------------------------------------- |
| `/health`            | GET              | Process health (does not check database connectivity) |
| `/api/auth/register` | POST             | Create account                                        |
| `/api/auth/login`    | POST             | Set session cookie; return identity and CSRF token    |
| `/api/auth/session`  | GET              | Restore identity and CSRF token                       |
| `/api/auth/logout`   | POST             | Revoke session and clear cookie                       |
| `/api/paystubs`      | GET, POST        | List/create paystubs                                  |
| `/api/paystubs/{id}` | GET, PUT, DELETE | Read/replace/delete own paystub                       |
| `/api/payments`      | GET, POST        | List/create payments                                  |
| `/api/payments/{id}` | GET, PUT, DELETE | Read/replace/delete own payment                       |

List endpoints support `limit` (1–100, default 50) and `offset`. PUT replaces all input
fields. Client-supplied ownership fields are ignored; ownership comes from the authenticated session.
A paid payment requires `paid_date`; a pending payment must omit it or set it to null.
Paystub net pay must equal gross pay minus deductions.

Example paystub:

```json
{
  "employer": "Example Co",
  "pay_date": "2026-11-15",
  "gross_cents": 250000,
  "deductions_cents": 50000,
  "net_cents": 200000,
  "currency": "CAD"
}
```

Example payment:

```json
{
  "recipient": "Landlord",
  "category": "rent",
  "amount_cents": 120000,
  "currency": "CAD",
  "due_date": "2026-12-01",
  "status": "pending"
}
```

## Development checks

From `backend/`, with the virtual environment active:

```sh
pytest
ruff check .
```

Tests use an isolated SQLite database and do not need Docker or `.env`.
The configured development frontend origin is http://localhost:5173; change
`CORS_ORIGINS` as a JSON array in `.env` if needed.

## Authentication security

Login is limited to 20 attempts per IP and 5 per normalized email per 15-minute window.
Registration is limited to 5 attempts per IP and 3 per normalized email per hour.
Successful attempts also count. Rejected attempts return 429 and a conservative
`Retry-After` header. Counters live in PostgreSQL and use atomic upserts, so restarting
or adding workers does not bypass limits. Expired counters reset atomically on use.
Schedule `python -m app.cleanup` daily to remove expired session/counter records; cleanup
runs outside login transactions to avoid lock contention during concurrent logins.
Changing `SECRET_KEY` invalidates CSRF tokens and resets counter identities.

All API mutations require a custom preflight-forcing header and reject unlisted Origin
headers. Authenticated writes/logout also require a session-bound CSRF token. CORS uses
explicit origins with credentials. API responses have `Cache-Control: no-store`.

The app uses the ASGI client IP for throttling. For direct local access, use
`--no-proxy-headers`. In production, configure your reverse proxy to overwrite forwarded
headers and configure Uvicorn to trust only that proxy's IP. Never trust arbitrary
`X-Forwarded-For` headers or set `--forwarded-allow-ips='*'` on an exposed service.

Optional integration checks against the local PostgreSQL instance (from `backend/`):

```sh
RUN_POSTGRES_TESTS=1 pytest -q tests/test_postgres_security.py
```

These verify real PostgreSQL permissions, cookie session/CSRF behavior, logout replay
rejection, and atomic limits across concurrent connections. Application QA records are
rolled back; the dedicated concurrency counter is removed afterward.

## Before deployment

Set `ENVIRONMENT=production`, a strong `SECRET_KEY`, a restricted PostgreSQL
`DATABASE_URL`, and explicit HTTPS `CORS_ORIGINS` through your hosting secret manager.
Production mode enables Secure cookies and rejects the known administrator usernames,
short database passwords, SQLite, wildcard origins, and non-HTTPS frontend origins.
Use a dedicated migration job for `MIGRATION_DATABASE_URL`; do not supply administrator
or migration credentials to the production API runtime. Use the same-site HTTPS topology
described above. Run a built frontend and a supervised API process without `--reload`.

The local Docker database binds only to 127.0.0.1. Keep production PostgreSQL on a private
network, with TLS for remote database connections, strong per-environment credentials,
and a restricted runtime role. Local environment files and bootstrap scripts are not a
substitute for a production secret manager or production infrastructure configuration.

Remaining deployment work includes Alembic schema migrations, automated backups with
restore tests, account recovery, security headers at the web server, and monitoring.
`python -m app.db` creates missing tables but does not alter existing schemas. Currency
amount limits also still need alignment with PostgreSQL integer columns before handling
very large amounts. Use private object storage when adding attachments. Never sum
amounts across currencies without conversion.
