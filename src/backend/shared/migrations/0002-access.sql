CREATE EXTENSION IF NOT EXISTS citext;

ALTER TABLE businesses
    ADD COLUMN legal_name text,
    ADD COLUMN pan text,
    ADD COLUMN default_layout_id integer REFERENCES layouts (id),
    ADD COLUMN default_style_profile_id integer REFERENCES style_profiles (id);

CREATE TABLE offices (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    business_id integer NOT NULL REFERENCES businesses (id),
    name text NOT NULL,
    code text NOT NULL UNIQUE CHECK (code ~ '^[A-Z0-9]{2,3}$'),
    state_code text NOT NULL CHECK (state_code ~ '^[0-9]{2}$'),
    address text,
    phone text,
    email text,
    gstin text,
    lut_reference text,
    lut_valid_until date,
    is_archived boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (id, business_id)
);

CREATE INDEX offices_business_id_idx ON offices (business_id);

CREATE TABLE roles (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name text NOT NULL UNIQUE,
    description text,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    key text PRIMARY KEY,
    group_name text NOT NULL,
    label text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE role_permissions (
    role_id integer NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_key text NOT NULL REFERENCES permissions (key) ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (role_id, permission_key)
);

CREATE TABLE users (
    id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email citext NOT NULL UNIQUE,
    full_name text NOT NULL,
    password_hash text NOT NULL,
    role_id integer NOT NULL REFERENCES roles (id),
    all_offices boolean NOT NULL DEFAULT false,
    is_active boolean NOT NULL DEFAULT true,
    must_change_password boolean NOT NULL DEFAULT false,
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX users_role_id_idx ON users (role_id);

CREATE TABLE user_permissions (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    permission_key text NOT NULL REFERENCES permissions (key) ON UPDATE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, permission_key)
);

CREATE TABLE user_offices (
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    office_id integer NOT NULL REFERENCES offices (id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, office_id)
);

CREATE INDEX user_offices_office_id_idx ON user_offices (office_id);

CREATE TABLE sessions (
    token_hash text PRIMARY KEY CHECK (token_hash ~ '^[0-9a-f]{64}$'),
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    csrf_secret text NOT NULL,
    ip inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL,
    absolute_expires_at timestamptz NOT NULL
);

CREATE INDEX sessions_user_id_idx ON sessions (user_id);

CREATE TABLE audit_logs (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    actor_user_id integer REFERENCES users (id),
    action text NOT NULL,
    entity_type text,
    entity_id text,
    business_id integer REFERENCES businesses (id),
    office_id integer,
    before jsonb,
    after jsonb,
    ip inet,
    request_id text,
    CHECK (office_id IS NULL OR business_id IS NOT NULL),
    FOREIGN KEY (office_id, business_id) REFERENCES offices (id, business_id)
);

CREATE INDEX audit_logs_occurred_at_idx ON audit_logs (occurred_at DESC);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_type, entity_id);

CREATE TABLE notifications (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id integer NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    type text NOT NULL,
    entity_type text,
    entity_id text,
    title text NOT NULL,
    body text,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON
    attachments, banks, businesses, categories, clients, currencies,
    invoice_bank_snapshots, invoice_business_snapshots, invoice_client_snapshots,
    invoice_currency_snapshots, invoice_customizations, invoice_item_snapshots, invoice_items,
    invoice_layout_snapshots, invoice_payments, invoice_sequences, invoice_style_profile_snapshots,
    invoices, items, layouts, presets, settings, style_profiles, units
    TO app_user;

GRANT SELECT, INSERT, UPDATE ON offices, users, notifications TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON roles TO app_user;
GRANT SELECT ON permissions TO app_user;
GRANT SELECT, INSERT, DELETE ON role_permissions, user_permissions, user_offices TO app_user;
GRANT SELECT, INSERT ON audit_logs TO app_user;
