# Phase 6: Hardening, backups and release readiness

**Goal:** The system is safe to run with real company data: security checks pass, backups are encrypted and stored off the host, restore has been tested, and operations are documented.

**Design refs:** D15, D22–D25. Design §2 assumptions 3 and 5, §6.5, §11, §12. Review C4, C5, C8, C10, C11, C15.
**Prereqs:** Phase 5 done. **User sign-off A7**, plus an off-host backup target (rclone remote or NAS path) and an `age` key pair generated and stored by the organisation.
**Branch:** `phase-6-hardening`

---

## Tasks

### 6.1 Security checklist (automated where possible, `__tests__/security/`)
- **IDOR sweep:** enumerate every route with `:id` (from router metadata). For each, request a record from another company → 404. Extends the Phase 1–3 suites.
- **CSRF:** every non-GET route without the token → 403; the login POST with a foreign `Origin` → 403.
- **Cookies:** `__Host-sid` is Secure, HttpOnly, SameSite=Lax and Path=/; the token rotates on login; idle and absolute expiry are enforced.
- **Rate limits:** login per IP+email and per IP; verified that users behind Caddy are keyed by the real client IP (`trust proxy 1`).
- **Headers:** helmet defaults. Add a CSP for the SPA (allow blob: and data: for react-pdf and images). HSTS is enabled at Caddy.
- **Uploads:** polyglot JPEG/HTML rejected or re-encoded; SVG rejected; path traversal in the filename has no effect; the PDF download is sandboxed.
- **SQL:** grep and ESLint rule against template literals inside `db.run/get/all/query` calls.
- **Anti-escalation and last-Super-Admin tests** re-run.
- **Logs:** a request with a password, cookie and CSRF token in it produces no secret in the captured logs.
- **Dependencies:** `npm audit --omit=dev` has no high or critical issues (or each exception is documented).

### 6.2 Backups (`backup` compose service, profile `ops`)
- Image `postgres:17-alpine` with `age`, `rclone` and `tar`. Nightly cron (02:30 IST) runs:
  1. `pg_dump -Fc` as `app_owner`.
  2. `tar` of `ATTACHMENTS_DIR`.
  3. `age -r $BACKUP_AGE_RECIPIENT` on both files.
  4. `rclone copy` to `$BACKUP_REMOTE`.
  5. Local and remote retention of 30 days.
  6. Exit non-zero on any failure, with output logged.
- `scripts/restore.sh <date>`: fetches the backup, decrypts it (private key supplied at run time, never stored on the server), restores the DB into a fresh volume, restores attachments, then runs the verification query (every `expense_attachments.storage_key` exists on disk) and the health check.

### 6.3 Restore drill
- On a separate machine or VM: restore the latest backup, log in, open an issued invoice PDF and an expense receipt, and run the report reconciliation. Record the result in `docs/ops/restore-drill-<date>.md`.

### 6.4 Operations docs (`docs/ops/`)
- `install.md`: server prerequisites, DNS, `.env` (mode 600), `docker compose up`, `admin-cli create-super-admin`, and the first-run setup checklist.
- `upgrade.md`: pull, backup, `migrate`, restart, smoke test.
- `backup-restore.md`: key handling, rotation, drill procedure.
- `security.md`: roles and permissions model, RLS overview, incident steps (revoke sessions, rotate secrets).
- Update `README.md` for this product (web + PostgreSQL), keeping MIT licence and upstream credit.

### 6.5 Final regression
- Full test suite and all e2e specs (invoice, expense, mobile, visual smoke) on a production-like `docker compose` stack with Caddy TLS.
- Manual walkthrough of the user's original checklist:
  - Invoices: create, edit (draft), view, print, download PDF, customer info, calculations, tax, numbering.
  - Expenses: submit, approve, reimburse.
  - Dashboards per role.
  - Reports and exports.

## Exit criteria
- [ ] Security checklist green; `npm audit` clean or documented
- [ ] Encrypted off-host backup created by the scheduled job; restore drill passed and recorded
- [ ] Ops docs complete
- [ ] `docs/plans/STATUS.md`: all phases done
