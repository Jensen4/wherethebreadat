"""Upgrade this project's local database roles without dropping tables or volumes."""

import os
import subprocess

from dotenv import dotenv_values
from setup_local import ROOT
from setup_local import main as setup


def main():
    setup()
    values = dotenv_values(ROOT / ".env")
    env = {**os.environ, **{key: value for key, value in values.items() if value is not None}}
    base = ["docker", "compose", "exec", "-T"]
    admin = None
    for candidate in ("bread_admin", "bread"):
        check = subprocess.run(
            base + ["db", "psql", "-U", candidate, "-d", "bread", "-Atc", "SELECT 1"],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if check.returncode == 0:
            admin = candidate
            break
    if admin is None:
        raise SystemExit(
            "Cannot reach the local database. Start Docker and run docker compose up -d db, then retry. No database changes made."
        )
    sql = r"""
\set ON_ERROR_STOP on
\getenv admin_password POSTGRES_ADMIN_PASSWORD
\getenv app_password POSTGRES_APP_PASSWORD
\getenv migrator_password POSTGRES_MIGRATOR_PASSWORD
BEGIN;
SELECT 'CREATE ROLE bread_admin LOGIN SUPERUSER' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bread_admin') \gexec
SELECT 'CREATE ROLE bread_app LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bread_app') \gexec
SELECT 'CREATE ROLE bread_migrator LOGIN' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'bread_migrator') \gexec
ALTER ROLE bread_admin WITH PASSWORD :'admin_password';
ALTER ROLE bread_app WITH PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER ROLE bread_migrator WITH PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
ALTER DATABASE bread OWNER TO bread_admin;
REVOKE ALL ON DATABASE bread FROM PUBLIC;
GRANT CONNECT ON DATABASE bread TO bread_app, bread_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bread_app;
GRANT USAGE, CREATE ON SCHEMA public TO bread_migrator;
SELECT format('ALTER TABLE public.%I OWNER TO bread_migrator', tablename) FROM pg_tables WHERE schemaname = 'public' \gexec
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO bread_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO bread_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bread_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bread_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bread_migrator IN SCHEMA public GRANT USAGE ON SEQUENCES TO bread_app;
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE usename = 'bread' AND datname = 'bread' AND pid <> pg_backend_pid();
SELECT format('ALTER ROLE bread NOLOGIN PASSWORD %L', :'admin_password') WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = 'bread') \gexec
COMMIT;
"""
    command = base + [
        "-e",
        "POSTGRES_ADMIN_PASSWORD",
        "-e",
        "POSTGRES_APP_PASSWORD",
        "-e",
        "POSTGRES_MIGRATOR_PASSWORD",
        "db",
        "psql",
        "-U",
        admin,
        "-d",
        "bread",
    ]
    result = subprocess.run(
        command, cwd=ROOT, env=env, input=sql, capture_output=True, text=True, check=False
    )
    if result.returncode:
        # Redact every generated credential before reporting database diagnostics.
        diagnostic = result.stderr
        for value in values.values():
            if value:
                diagnostic = diagnostic.replace(value, "[redacted]")
        raise SystemExit(
            "Database role upgrade failed; transaction rolled back. No tables or volumes removed.\n"
            + diagnostic
        )
    print(
        "Database secured: random passwords, restricted runtime role, separate table owner, legacy login disabled."
    )
    print("Existing records preserved. Next: cd backend && python -m app.db")


if __name__ == "__main__":
    main()
