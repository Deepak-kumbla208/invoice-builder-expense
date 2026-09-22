-- Database roles (design §6.2, D15). Runs as a superuser: from the postgres image's
-- /docker-entrypoint-initdb.d on first start, and from CI before migrations. Re-runnable.
--   app_owner  owns the schema and runs migrations; BYPASSRLS
--   app_user   the API's login; row-level security applies
-- Passwords come from APP_OWNER_PASSWORD and APP_USER_PASSWORD.

\set ON_ERROR_STOP on

\getenv app_owner_password APP_OWNER_PASSWORD
\getenv app_user_password APP_USER_PASSWORD
\if :{?app_owner_password}
\else
\set app_owner_password ''
\endif
\if :{?app_user_password}
\else
\set app_user_password ''
\endif

SELECT :'app_owner_password' <> '' AND :'app_user_password' <> '' AS passwords_set \gset
\if :passwords_set
\else
DO $$ BEGIN RAISE EXCEPTION 'APP_OWNER_PASSWORD and APP_USER_PASSWORD must be set'; END $$;
\endif

SELECT 'CREATE ROLE app_owner' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_owner') \gexec
SELECT 'CREATE ROLE app_user' WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_user') \gexec

ALTER ROLE app_owner WITH LOGIN BYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_owner_password';
ALTER ROLE app_user WITH LOGIN NOBYPASSRLS NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD :'app_user_password';
ALTER ROLE app_user SET statement_timeout = '15s';
ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';

SELECT format('GRANT CONNECT, CREATE ON DATABASE %I TO app_owner', current_database()) \gexec
GRANT CREATE ON SCHEMA public TO app_owner;
