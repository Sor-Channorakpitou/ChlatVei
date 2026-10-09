-- One-time setup for running ChlatVei without Docker, against a local PostgreSQL.
-- Run as the postgres superuser:
--   psql -U postgres -p 5432 -f scripts/local-db.sql
-- Same user, password and databases as docker-compose.yml, so backend/.env only changes its port.
CREATE ROLE chlatvei LOGIN PASSWORD 'chlatvei_dev' CREATEDB;
CREATE DATABASE chlatvei OWNER chlatvei;
-- Separate database for automated tests
CREATE DATABASE chlatvei_test OWNER chlatvei;
