#!/bin/sh
set -eu
# psql reads secrets from the container environment, never command arguments.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" << 'SQL'
\set ON_ERROR_STOP on
\getenv app_password APP_DB_PASSWORD
\getenv migrator_password MIGRATOR_DB_PASSWORD
CREATE ROLE bread_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
CREATE ROLE bread_migrator LOGIN PASSWORD :'migrator_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
REVOKE ALL ON DATABASE bread FROM PUBLIC;
GRANT CONNECT ON DATABASE bread TO bread_app, bread_migrator;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO bread_app;
GRANT USAGE, CREATE ON SCHEMA public TO bread_migrator;
ALTER DEFAULT PRIVILEGES FOR ROLE bread_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO bread_app;
ALTER DEFAULT PRIVILEGES FOR ROLE bread_migrator IN SCHEMA public GRANT USAGE ON SEQUENCES TO bread_app;
SQL
