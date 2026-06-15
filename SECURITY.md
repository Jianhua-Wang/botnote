# Security Policy

## Reporting a vulnerability

Please report suspected vulnerabilities through GitHub Security Advisories for
this repository. If advisories are unavailable, open a minimal issue that says
you need a private security contact and do not include exploit details publicly.

## Secrets and local data

botnote stores user data in Postgres. If API token copyability is enabled,
newly-created token plaintext is stored recoverably so the Settings UI can copy
it later. Treat the database, database dumps, and backups as secret-bearing
material.

Never commit:

- `.env`
- real `DATABASE_URL` values
- `OPENAI_API_KEY`
- API bearer tokens
- production database dumps
