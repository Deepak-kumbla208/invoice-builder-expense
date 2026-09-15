# Phase 3: Expenses, approvals, reimbursements and payouts

**Goal:** Employees record INR expenses with receipts. Approvers approve or reject in one step. Employee-paid expenses become reimbursements, which admins pay in grouped payouts. In-app notifications and audit logging cover every step.

**Design refs:** D5, D9, D10, D24, D27. Design §7.3, §7.4, §8 Expenses/Reimbursements/Notifications, §9 screens, §10. Review S3, S14, C3, C6, C8, U4–U6, U10–U14.
**Prereqs:** Phase 2 done.
**Branch:** `phase-3-expenses`

---

## Tasks

### 3.1 Migration `0005-expenses.sql`
- New tables: `expense_categories`, `category_businesses (… is_enabled)`, `expenses` (status includes `returned`, CHECK against self-decision, composite FKs `(office_id, business_id)` and `(category_id, business_id)`), `expense_attachments`, `reimbursements` (partial unique `(expense_id) WHERE status <> 'cancelled'`, composite FKs), `reimbursement_payouts` (`UNIQUE(id, office_id)`).
- Seed a starter category set: Water, Electricity, Internet, Office supplies, Stationery, Repairs & maintenance, Travel, Food & refreshments, Courier, Transportation, Software subscriptions, Equipment, Miscellaneous. Add a trigger or service hook so a new company gets enabled `category_businesses` rows.
- RLS (ENABLE + FORCE, separate policies): expenses, reimbursements and payouts by `office_id`; attachments via the parent expense; categories readable by any authenticated user; `category_businesses` by `business_id`.
- Definer function `sys_attachment_keys()`, used only by the orphan sweep.

### 3.2 Workflow module
- `shared/workflow/expense.ts`: a transition table `{ from, action, to, permission, guard }`.
  - draft→submitted (`submit`, owner)
  - submitted→approved (`approve`, `expense.approve`, not submitter)
  - submitted→rejected (`reject`, reason required)
  - rejected→submitted and returned→submitted (`resubmit`, owner, after edit)
  - approved→completed: automatic for `company_paid` and `direct_supplier`, or on payout for `employee_paid`
- `shared/workflow/reimbursement.ts`: pending→paid (`reimbursement.pay`, via payout) and pending→cancelled (`reimbursement.cancel`, reason required). Cancelling sets the expense to `returned`.
- Unit tests cover the full table, including illegal transitions → 409.

### 3.3 Attachment storage (`shared/storage/attachments.ts`)
- Multer disk storage in `ATTACHMENTS_DIR/tmp`, **before** `withRequestTx`, with a 10 MB limit and a single file per request.
- Detect the type with `file-type` (JPG, PNG, WEBP, PDF only). Images are re-encoded with `sharp` (strips metadata); PDFs are stored as-is.
- Compute `sha256` and move the file to `ATTACHMENTS_DIR/<uuid>`. In the same transaction, insert `expense_attachments` with the **detected** MIME type. On transaction failure, delete the file.
- Download route streams the file after an RLS-filtered lookup, with `Content-Disposition: attachment; filename*=UTF-8''…`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`.
- Daily orphan sweep via `withSystemTx('orphan-sweep')`: delete files older than 24 h with no key in `sys_attachment_keys()`; delete tmp files older than 1 h.

### 3.4 Services and controllers
- **Expenses:**
  - Paged list with filters (employee, company, office, category, date, amount range, status, reimbursement status). `expense.view_own` → `submitted_by = me`; `view_all` → all in scope.
  - Detail; create and update allowed only in draft, rejected or returned.
  - Validate the category is enabled for the company and the office is in the user's scope.
  - Actions submit, approve, reject and delete (draft only).
- **Approver routing** (computed at read time): eligible approvers are users with `expense.approve` whose offices include the expense office (or `all_offices`), excluding the submitter.
  - The approvals queue lists submitted expenses where the viewer is eligible.
  - The expense detail shows "Awaiting approval by <role names, office>".
  - If there are no eligible approvers, show a banner on the expense (U11/S14).
- On approve:
  - `employee_paid` → insert a `reimbursements` row (pending).
  - Otherwise → set the expense status to `completed`.
- **Reimbursements:**
  - List views mine, pending (grouped by employee + office) and history.
  - Cancel with a reason.
- **Payouts:** `POST /api/payouts { reimbursementIds, paidAt, method, reference, notes }`.
  - All selected items must be pending, and belong to the same employee and office.
  - Create the payout, mark the reimbursements paid and their expenses completed, and total them, all in one transaction.
- **Notifications:**
  - Service `notify(db, userIds, type, entity, title, body)`.
  - Events: `expense.submitted` (to eligible approvers), `expense.approved`, `expense.rejected`, `reimbursement.cancelled`, `reimbursement.paid`.
  - Routes `GET /api/notifications` (paged, unread count), `POST /:id/read` and `POST /read-all`.
- Audit for every action, with before/after status and amounts.
- Expense categories admin: CRUD plus per-company `is_enabled` toggles (`admin.expense_categories`).

### 3.5 UI
- **Expenses list:** labelled "My expenses" without `view_all`; cards on mobile.
- **Expense form:**
  - Office (required when "All" is selected; pre-filled for single-office users) and category (enabled for that company only).
  - Date (default today, IST), amount (INR), optional GST amount and vendor GSTIN, vendor, bill number, description.
  - Payment type, labelled "I paid (reimburse me)" (default) / "Company paid" / "Paid directly to supplier".
  - Receipt upload with `accept="image/jpeg,image/png,image/webp,application/pdf"`, a preview thumbnail, and the error message "Use JPG, PNG, WEBP or PDF up to 10 MB".
  - **Submit** is the primary button; Save draft is secondary. A 401 during submit keeps the form state in `sessionStorage` and restores it after login.
- **Expense detail:** combined employee-facing status, timeline from audit events, rejection or return reason, attachments.
- **Approvals queue:** ignores the office switcher and shows an Office column. Approve, or reject with a reason.
- **Reimbursements pages:** My (status and paid date/reference), Pending (grouped by employee and office; select within one group → **Record payment** dialog), History.
- **Notification bell** in the top bar: unread badge, 60 s polling, dropdown list with links (a link that 404s shows `NoAccess`).
- **Admin:** Expense categories page with company toggles.

### 3.6 Tests (phase gate)
- **Workflow:** every legal and illegal transition; self-approval blocked by both the service and the DB CHECK; resubmit after reject and after return; re-approve after a cancelled reimbursement creates a new reimbursement (partial unique index).
- **Payouts:** mixed employees → 409; mixed offices → 409; a non-pending item → 409; totals correct; atomic (inject a failure → nothing changes).
- **Uploads:**
  - A renamed `.exe` → 400; oversize → 413.
  - JPEG with EXIF GPS → the stored file has no EXIF.
  - PDF download headers correct.
  - Failed transaction → no file left; orphan sweep respects the 24 h grace.
- **RLS/IDOR:**
  - All new tables are in the RLS suite.
  - An expense with another company's category → rejected.
  - A reimbursement or payout across offices → rejected.
  - Another office's attachment download → 404.
  - `view_own` cannot see a colleague's expense.
- **Notifications:** recipients per event; a user cannot read another user's notifications.
- **E2E (mobile viewport 390×844):** employee submits with a receipt photo → admin approves → admin records the payment → employee sees "Paid on <date> (ref)". Also: reject → edit → resubmit.

## Exit criteria
- [ ] Phase gate green; invoice regression e2e still green
- [ ] RLS suite covers all Phase 3 tables; permission matrix updated
- [ ] `docs/plans/STATUS.md` updated
