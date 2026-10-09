-- Phase 2.3: office and company scoping for invoices, plus the GST columns the shared tax module
-- (Phase 2.2) computes into. Design §7.2, decisions D17–D21.
--
-- This is the EXPAND half of an expand/contract pair. Everything here is additive: new columns are
-- NULLable, new tables are empty, and the legacy columns and keys the current service still reads
-- and writes are left in place. The CONTRACT half belongs with the service rewrite in 2.4, which
-- is the first point at which the old paths stop being used:
--   * tighten office_id, business_id and the new invoice_sequences key to NOT NULL
--   * add the invoices (clientId, businessId) -> clients (id, business_id) composite FK (C3)
--   * drop invoices.taxName/taxRate/taxType, invoice_items.taxRate/taxType, items.taxRate/taxType
--   * drop the old invoice_sequences businessId/clientId key and columns
--   * drop settings.invoicePrefix/invoiceSuffix
--   * ENABLE + FORCE row level security on invoices, its child tables, clients, items, banks,
--     presets and invoice_sequences
-- Dropping those here would break the running service and the suite at this commit, since nothing
-- populates the new scope columns until 2.4.

-- ---------------------------------------------------------------------------
-- GST rate slabs: seeded from the currently notified rates, admin-editable (binding condition 8)
-- ---------------------------------------------------------------------------

CREATE TABLE gst_rates (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    rate numeric(5, 2) NOT NULL UNIQUE,
    label text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    updated_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT gst_rates_rate_range CHECK (rate >= 0 AND rate <= 100)
);

INSERT INTO gst_rates (rate, label) VALUES
    (0, 'Nil'),
    (0.25, '0.25%'),
    (1.5, '1.5%'),
    (3, '3%'),
    (5, '5%'),
    (18, '18%'),
    (40, '40%');

-- ---------------------------------------------------------------------------
-- Customers, items, banks and presets become company-scoped
-- ---------------------------------------------------------------------------

ALTER TABLE clients
    ADD COLUMN business_id integer REFERENCES businesses (id),
    ADD COLUMN gstin text,
    ADD COLUMN state_code text,
    ADD COLUMN is_sez boolean DEFAULT false NOT NULL,
    ADD COLUMN uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    ADD CONSTRAINT clients_gstin_format CHECK (gstin IS NULL OR gstin ~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$'),
    ADD CONSTRAINT clients_state_code_format CHECK (state_code IS NULL OR state_code ~ '^[0-9]{2}$');

-- Lets invoices carry a composite FK, so a customer can never be borrowed by another company (C3).
-- clients already carries "countryCode" for Peppol; it is the same fact GST needs for a foreign
-- place of supply, so it is reused with an India default rather than duplicated as country_code.
ALTER TABLE clients ALTER COLUMN "countryCode" SET DEFAULT 'IN';
UPDATE clients SET "countryCode" = 'IN' WHERE "countryCode" IS NULL;

CREATE UNIQUE INDEX clients_id_business_id_key ON clients (id, business_id);
CREATE INDEX clients_business_id_idx ON clients (business_id);
CREATE UNIQUE INDEX clients_uuid_key ON clients (uuid);

ALTER TABLE items
    ADD COLUMN business_id integer REFERENCES businesses (id),
    ADD COLUMN hsn_sac text,
    ADD COLUMN gst_rate numeric(5, 2),
    ADD CONSTRAINT items_hsn_sac_format CHECK (hsn_sac IS NULL OR hsn_sac ~ '^[0-9]{4,8}$'),
    ADD CONSTRAINT items_gst_rate_range CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100));

CREATE UNIQUE INDEX items_id_business_id_key ON items (id, business_id);
CREATE INDEX items_business_id_idx ON items (business_id);

ALTER TABLE banks ADD COLUMN business_id integer REFERENCES businesses (id);
CREATE UNIQUE INDEX banks_id_business_id_key ON banks (id, business_id);
CREATE INDEX banks_business_id_idx ON banks (business_id);

ALTER TABLE presets ADD COLUMN business_id integer REFERENCES businesses (id);
CREATE INDEX presets_business_id_idx ON presets (business_id);

-- Which of the company's banks each office may put on an invoice.
CREATE TABLE office_bank_accounts (
    office_id integer NOT NULL REFERENCES offices (id) ON DELETE CASCADE,
    bank_id integer NOT NULL REFERENCES banks (id) ON DELETE CASCADE,
    created_at timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (office_id, bank_id)
);

CREATE INDEX office_bank_accounts_bank_id_idx ON office_bank_accounts (bank_id);

-- ---------------------------------------------------------------------------
-- Invoices: office scoping, document lifecycle, GST and currency
-- ---------------------------------------------------------------------------

ALTER TABLE invoices
    ADD COLUMN office_id integer REFERENCES offices (id),
    ADD COLUMN created_by integer REFERENCES users (id),
    ADD COLUMN uuid uuid DEFAULT gen_random_uuid() NOT NULL,
    ADD COLUMN document_status text DEFAULT 'draft' NOT NULL,
    ADD COLUMN original_invoice_id integer,
    ADD COLUMN supply_type text,
    ADD COLUMN place_of_supply_state_code text,
    ADD COLUMN prices_include_tax boolean DEFAULT false NOT NULL,
    ADD COLUMN exchange_rate_to_inr numeric(18, 6),
    ADD COLUMN exchange_rate_source text,
    ADD COLUMN exchange_rate_date date,
    ADD COLUMN subtotal_cents bigint,
    ADD COLUMN tax_cents bigint,
    ADD COLUMN total_cents bigint,
    ADD COLUMN total_inr_cents bigint,
    ADD COLUMN issued_by integer REFERENCES users (id),
    ADD COLUMN issued_at timestamptz,
    ADD COLUMN cancelled_by integer REFERENCES users (id),
    ADD COLUMN cancelled_at timestamptz,
    ADD COLUMN cancel_reason text,
    ADD CONSTRAINT invoices_document_status_check
        CHECK (document_status = ANY (ARRAY['draft', 'issued', 'cancelled'])),
    ADD CONSTRAINT invoices_supply_type_check
        CHECK (supply_type IS NULL OR supply_type = ANY (ARRAY['intra_state', 'inter_state', 'export_lut', 'export_igst', 'sez_lut', 'sez_igst'])),
    ADD CONSTRAINT invoices_pos_format
        CHECK (place_of_supply_state_code IS NULL OR place_of_supply_state_code ~ '^[0-9]{2}$'),
    ADD CONSTRAINT invoices_exchange_rate_positive
        CHECK (exchange_rate_to_inr IS NULL OR exchange_rate_to_inr > 0),
    -- Only an issued invoice carries a number; only a cancelled one carries cancellation details.
    ADD CONSTRAINT invoices_issued_has_number
        CHECK (document_status <> 'issued' OR "invoiceNumber" IS NOT NULL),
    ADD CONSTRAINT invoices_cancelled_has_reason
        CHECK (document_status = 'cancelled' OR (cancelled_at IS NULL AND cancelled_by IS NULL AND cancel_reason IS NULL)),
    -- A credit note references exactly one original invoice, and nothing else does.
    ADD CONSTRAINT invoices_credit_note_has_original
        CHECK (("invoiceType" = 'credit_note') = (original_invoice_id IS NOT NULL)),
    ADD CONSTRAINT invoices_original_not_self
        CHECK (original_invoice_id IS NULL OR original_invoice_id <> id);

-- A2: drafts are unnumbered, so the number becomes nullable and is assigned at issue (D17).
ALTER TABLE invoices ALTER COLUMN "invoiceNumber" DROP NOT NULL;

-- The document date is a business date on the IST calendar, not a moment in time.
ALTER TABLE invoices ALTER COLUMN "issuedAt" TYPE date USING "issuedAt"::date;

-- invoiceType gains credit_note.
ALTER TABLE invoices DROP CONSTRAINT "invoices_invoiceType_check";
ALTER TABLE invoices ADD CONSTRAINT "invoices_invoiceType_check"
    CHECK ("invoiceType" = ANY (ARRAY['quotation', 'invoice', 'credit_note']));

-- The legacy key spanned the company, the full number, the customer and the type. D20 moves the
-- series to the office, and leaves drafts out of it entirely.
ALTER TABLE invoices DROP CONSTRAINT invoices_businessid_invoicefullnumber_clientid_invoicetype_key;
CREATE UNIQUE INDEX invoices_office_type_number_key
    ON invoices (office_id, "invoiceType", "invoiceNumber")
    WHERE "invoiceNumber" IS NOT NULL;

-- Composite FKs: an invoice's office must belong to its company, and so must its customer (C3).
CREATE UNIQUE INDEX invoices_id_office_id_key ON invoices (id, office_id);
-- (office_id, businessId) and (original_invoice_id, office_id) can go on now: office_id is still
-- NULL on existing rows, and a composite FK with a NULL column is not enforced (MATCH SIMPLE).
-- The customer FK cannot: "clientId" and "businessId" are both NOT NULL, so it would be enforced
-- immediately against clients.business_id, which nothing populates until 2.4. It is added in the
-- contract step, together with the NOT NULL on clients.business_id.
ALTER TABLE invoices
    ADD CONSTRAINT invoices_office_business_fkey
        FOREIGN KEY (office_id, "businessId") REFERENCES offices (id, business_id),
    ADD CONSTRAINT invoices_original_office_fkey
        FOREIGN KEY (original_invoice_id, office_id) REFERENCES invoices (id, office_id);

CREATE INDEX invoices_office_id_idx ON invoices (office_id);
CREATE INDEX invoices_document_status_idx ON invoices (document_status);
CREATE INDEX invoices_original_invoice_id_idx ON invoices (original_invoice_id);
CREATE INDEX invoices_created_by_idx ON invoices (created_by);
CREATE UNIQUE INDEX invoices_uuid_key ON invoices (uuid);

-- ---------------------------------------------------------------------------
-- Invoice children
-- ---------------------------------------------------------------------------

ALTER TABLE invoice_items
    ADD COLUMN hsn_sac text,
    ADD COLUMN gst_rate numeric(5, 2),
    ADD COLUMN cgst_cents bigint,
    ADD COLUMN sgst_cents bigint,
    ADD COLUMN igst_cents bigint,
    ADD CONSTRAINT invoice_items_gst_rate_range
        CHECK (gst_rate IS NULL OR (gst_rate >= 0 AND gst_rate <= 100));

ALTER TABLE invoice_payments
    ADD COLUMN amount_inr_cents bigint,
    ADD COLUMN reference text;

-- The issuing office as it stood when the invoice was issued (D17 rebuilds every snapshot there).
CREATE TABLE invoice_office_snapshots (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    "parentInvoiceId" integer NOT NULL UNIQUE REFERENCES invoices (id) ON DELETE CASCADE,
    office_name text NOT NULL,
    gstin text,
    state_code text,
    address text,
    lut_reference text,
    "createdAt" timestamptz DEFAULT now() NOT NULL,
    "updatedAt" timestamptz DEFAULT now() NOT NULL
);

-- The snapshot already carries "clientCountryCode", so only the GST-specific facts are added.
ALTER TABLE invoice_client_snapshots
    ADD COLUMN gstin text,
    ADD COLUMN state_code text,
    ADD COLUMN is_sez boolean;

-- ---------------------------------------------------------------------------
-- Numbering series: per office, per document type, per financial year (D20)
-- ---------------------------------------------------------------------------

ALTER TABLE invoice_sequences
    ADD COLUMN office_id integer REFERENCES offices (id) ON DELETE CASCADE,
    ADD COLUMN invoice_type text,
    ADD COLUMN financial_year text,
    ADD COLUMN next_sequence bigint,
    ADD CONSTRAINT invoice_sequences_invoice_type_check
        CHECK (invoice_type IS NULL OR invoice_type = ANY (ARRAY['quotation', 'invoice', 'credit_note'])),
    ADD CONSTRAINT invoice_sequences_financial_year_format
        CHECK (financial_year IS NULL OR financial_year ~ '^[0-9]{2}-[0-9]{2}$'),
    ADD CONSTRAINT invoice_sequences_next_sequence_positive
        CHECK (next_sequence IS NULL OR next_sequence > 0);

CREATE UNIQUE INDEX invoice_sequences_office_type_fy_key
    ON invoice_sequences (office_id, invoice_type, financial_year)
    WHERE office_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Row level security on the tables this migration creates. The existing tables get theirs in the
-- contract step, once the services populate their scope columns.
-- ---------------------------------------------------------------------------

-- gst_rates is a global reference table like currencies and units, so it carries no RLS; the
-- admin.settings permission on the route is what gates writing to it.
GRANT SELECT, INSERT, UPDATE, DELETE ON gst_rates, office_bank_accounts, invoice_office_snapshots TO app_user;

ALTER TABLE office_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE office_bank_accounts FORCE ROW LEVEL SECURITY;
CREATE POLICY office_bank_accounts_select ON office_bank_accounts FOR SELECT TO app_user
    USING (app_office_visible(office_id));
CREATE POLICY office_bank_accounts_insert ON office_bank_accounts FOR INSERT TO app_user
    WITH CHECK (app_office_visible(office_id));
CREATE POLICY office_bank_accounts_update ON office_bank_accounts FOR UPDATE TO app_user
    USING (app_office_visible(office_id))
    WITH CHECK (app_office_visible(office_id));
CREATE POLICY office_bank_accounts_delete ON office_bank_accounts FOR DELETE TO app_user
    USING (app_office_visible(office_id));

-- Reached through the parent invoice's office, which is how every invoice child table is scoped.
CREATE FUNCTION app_invoice_visible(p_invoice_id integer) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM invoices
        WHERE id = p_invoice_id AND office_id IS NOT NULL AND app_office_visible(office_id)
    )
$$;

REVOKE EXECUTE ON FUNCTION app_invoice_visible(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_invoice_visible(integer) TO app_user;

ALTER TABLE invoice_office_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_office_snapshots FORCE ROW LEVEL SECURITY;
CREATE POLICY invoice_office_snapshots_select ON invoice_office_snapshots FOR SELECT TO app_user
    USING (app_invoice_visible("parentInvoiceId"));
CREATE POLICY invoice_office_snapshots_insert ON invoice_office_snapshots FOR INSERT TO app_user
    WITH CHECK (app_invoice_visible("parentInvoiceId"));
CREATE POLICY invoice_office_snapshots_update ON invoice_office_snapshots FOR UPDATE TO app_user
    USING (app_invoice_visible("parentInvoiceId"))
    WITH CHECK (app_invoice_visible("parentInvoiceId"));
CREATE POLICY invoice_office_snapshots_delete ON invoice_office_snapshots FOR DELETE TO app_user
    USING (app_invoice_visible("parentInvoiceId"));
