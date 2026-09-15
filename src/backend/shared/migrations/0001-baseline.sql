CREATE TABLE attachments (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "fileName" text NOT NULL,
    "fileType" text NOT NULL,
    "fileSize" integer NOT NULL,
    data bytea NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE attachments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME attachments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE banks (
    id integer NOT NULL,
    name text NOT NULL,
    "bankName" text,
    "accountNumber" text,
    "swiftCode" text,
    address text,
    "branchCode" text,
    type text,
    "routingNumber" text,
    "upiCode" text,
    "qrCode" bytea,
    "qrCodeFileSize" integer,
    "qrCodeFileType" text,
    "qrCodeFileName" text,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "accountHolder" text,
    "sortOrder" text,
    CONSTRAINT "banks_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE banks ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME banks_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE businesses (
    id integer NOT NULL,
    name text NOT NULL,
    "shortName" text NOT NULL,
    address text,
    role text,
    email text,
    phone text,
    website text,
    additional text,
    "paymentInformation" text,
    logo bytea,
    "fileSize" integer,
    "fileType" text,
    "fileName" text,
    description text,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vatCode" text,
    code text,
    "peppolEndpointId" text,
    "countryCode" text,
    "peppolEndpointSchemeId" text,
    CONSTRAINT "businesses_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "businesses_shortName_check" CHECK ((length("shortName") <= 2))
);

ALTER TABLE businesses ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME businesses_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE categories (
    id integer NOT NULL,
    name text NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "categories_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE categories ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME categories_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE clients (
    id integer NOT NULL,
    name text NOT NULL,
    "shortName" text NOT NULL,
    address text,
    email text,
    phone text,
    code text,
    additional text,
    description text,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "vatCode" text,
    "peppolEndpointId" text,
    "countryCode" text,
    "peppolEndpointSchemeId" text,
    "buyerReference" text,
    CONSTRAINT "clients_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "clients_shortName_check" CHECK ((length("shortName") <= 2))
);

ALTER TABLE clients ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME clients_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE currencies (
    id integer NOT NULL,
    code text NOT NULL,
    symbol text NOT NULL,
    text text NOT NULL,
    format text NOT NULL,
    subunit integer DEFAULT 100 NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "currencies_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE currencies ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME currencies_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_bank_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    name text NOT NULL,
    "bankName" text NOT NULL,
    "accountNumber" text NOT NULL,
    "swiftCode" text,
    address text,
    "branchCode" text,
    type text,
    "routingNumber" text,
    "upiCode" text,
    "qrCode" bytea,
    "qrCodeFileSize" integer,
    "qrCodeFileType" text,
    "qrCodeFileName" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "accountHolder" text,
    "sortOrder" text
);

ALTER TABLE invoice_bank_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_bank_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_business_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "businessName" text NOT NULL,
    "businessShortName" text NOT NULL,
    "businessAddress" text,
    "businessRole" text,
    "businessEmail" text,
    "businessPhone" text,
    "businessAdditional" text,
    "businessPaymentInformation" text,
    "businessLogo" bytea,
    "businessFileSize" integer,
    "businessFileType" text,
    "businessFileName" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "businessVatCode" text,
    "businessCode" text,
    "businessPeppolEndpointId" text,
    "businessCountryCode" text,
    "businessPeppolEndpointSchemeId" text,
    CONSTRAINT "invoice_business_snapshots_businessShortName_check" CHECK ((length("businessShortName") <= 2))
);

ALTER TABLE invoice_business_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_business_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_client_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "clientName" text NOT NULL,
    "clientAddress" text,
    "clientEmail" text,
    "clientPhone" text,
    "clientCode" text,
    "clientAdditional" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "clientVatCode" text,
    "clientPeppolEndpointId" text,
    "clientCountryCode" text,
    "clientPeppolEndpointSchemeId" text,
    "clientBuyerReference" text
);

ALTER TABLE invoice_client_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_client_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_currency_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "currencyCode" text NOT NULL,
    "currencySymbol" text NOT NULL,
    "currencySubunit" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE invoice_currency_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_currency_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_customizations (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    color text DEFAULT '#006400'::text NOT NULL,
    "logoSize" text DEFAULT 'medium'::text NOT NULL,
    "fontSize" text DEFAULT 'medium'::text NOT NULL,
    "tableHeaderStyle" text DEFAULT 'light'::text NOT NULL,
    "tableRowStyle" text DEFAULT 'classic'::text NOT NULL,
    "pageFormat" text DEFAULT 'A4'::text NOT NULL,
    "labelUpperCase" integer DEFAULT 0 NOT NULL,
    "watermarkFileName" text,
    "watermarkFileType" text,
    "watermarkFileSize" integer,
    "watermarkFileData" bytea,
    "paidWatermarkFileName" text,
    "paidWatermarkFileType" text,
    "paidWatermarkFileSize" integer,
    "paidWatermarkFileData" bytea,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "showQuantity" integer DEFAULT 1 NOT NULL,
    "showUnit" integer DEFAULT 1 NOT NULL,
    "showRowNo" integer DEFAULT 1 NOT NULL,
    "fieldSortOrders" text DEFAULT '{"no":0,"item":1,"unit":2,"quantity":3,"unitCost":4,"total":5}'::text NOT NULL,
    "fontFamily" text DEFAULT 'Roboto'::text NOT NULL,
    "pdfTexts" text,
    CONSTRAINT "invoice_customizations_labelUpperCase_check" CHECK (("labelUpperCase" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "invoice_customizations_showQuantity_check" CHECK (("showQuantity" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "invoice_customizations_showRowNo_check" CHECK (("showRowNo" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "invoice_customizations_showUnit_check" CHECK (("showUnit" = ANY (ARRAY[0, 1])))
);

ALTER TABLE invoice_customizations ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_customizations_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_item_snapshots (
    id integer NOT NULL,
    "parentInvoiceItemId" integer NOT NULL,
    "itemName" text NOT NULL,
    "unitPriceCents" text DEFAULT 0 NOT NULL,
    "unitName" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE invoice_item_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_item_snaphots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_items (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "itemId" integer NOT NULL,
    quantity text DEFAULT 0 NOT NULL,
    "taxRate" real DEFAULT 0 NOT NULL,
    "taxType" text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "customField" text,
    CONSTRAINT "invoice_items_taxType_check" CHECK ((("taxType" = ANY (ARRAY['exclusive'::text, 'inclusive'::text])) OR ("taxType" IS NULL)))
);

ALTER TABLE invoice_items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_layout_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "layoutSchema" text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE invoice_layout_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_layout_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_payments (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "amountCents" text NOT NULL,
    "paidAt" timestamp without time zone DEFAULT now() NOT NULL,
    "paymentMethod" text NOT NULL,
    notes text,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE invoice_payments ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_payments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_sequences (
    id integer NOT NULL,
    "businessId" integer NOT NULL,
    "clientId" integer NOT NULL,
    "nextSequence" bigint NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "invoiceType" text DEFAULT 'invoice'::text NOT NULL,
    CONSTRAINT "invoice_sequences_invoiceType_check" CHECK (("invoiceType" = ANY (ARRAY['quotation'::text, 'invoice'::text])))
);

ALTER TABLE invoice_sequences ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_sequences_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoice_style_profile_snapshots (
    id integer NOT NULL,
    "parentInvoiceId" integer NOT NULL,
    "styleProfileName" text NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL
);

ALTER TABLE invoice_style_profile_snapshots ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoice_style_profile_snapshots_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE invoices (
    id integer NOT NULL,
    "invoiceType" text NOT NULL,
    "convertedFromQuotationId" integer,
    "businessId" integer NOT NULL,
    "clientId" integer NOT NULL,
    "currencyId" integer NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "issuedAt" timestamp without time zone NOT NULL,
    "dueDate" timestamp without time zone,
    "invoiceNumber" text NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    status text DEFAULT 'unpaid'::text NOT NULL,
    "customerNotes" text,
    "thanksNotes" text,
    "termsConditionNotes" text,
    "discountName" text,
    "discountType" text,
    "discountAmountCents" text DEFAULT 0 NOT NULL,
    "discountPercent" real DEFAULT 0 NOT NULL,
    "shippingFeeCents" text DEFAULT 0 NOT NULL,
    "invoicePrefix" text,
    "invoiceSuffix" text,
    "taxName" text,
    "taxRate" real DEFAULT 0 NOT NULL,
    "taxType" text,
    language text DEFAULT 'en'::text NOT NULL,
    "invoiceFullNumber" text GENERATED ALWAYS AS (((COALESCE("invoicePrefix", ''::text) || "invoiceNumber") || COALESCE("invoiceSuffix", ''::text))) STORED,
    "signatureData" bytea,
    "signatureName" text,
    "signatureType" text,
    "signatureSize" integer,
    "styleProfilesId" integer,
    "bankId" integer,
    "paidAt" timestamp without time zone,
    "closedAt" timestamp without time zone,
    "surchargeName" text,
    "surchargeAmountCents" text DEFAULT '0'::text NOT NULL,
    "surchargeType" text,
    "surchargePercent" real DEFAULT 0 NOT NULL,
    "layoutId" integer,
    CONSTRAINT invoices_check CHECK (((("discountType" = 'fixed'::text) AND (("discountAmountCents")::numeric >= (0)::numeric) AND ("discountPercent" = (0)::double precision)) OR (("discountType" = 'percentage'::text) AND (("discountPercent" >= (0)::double precision) AND ("discountPercent" <= (100)::double precision)) AND (("discountAmountCents")::numeric = (0)::numeric)) OR (("discountType" IS NULL) AND (("discountAmountCents")::numeric = (0)::numeric) AND ("discountPercent" = (0)::double precision)))),
    CONSTRAINT invoices_check1 CHECK ((("dueDate" IS NULL) OR ("dueDate" >= "issuedAt"))),
    CONSTRAINT invoices_check2 CHECK ((("convertedFromQuotationId" IS NULL) OR ("convertedFromQuotationId" <> id))),
    CONSTRAINT "invoices_discountType_check" CHECK ((("discountType" = ANY (ARRAY['fixed'::text, 'percentage'::text])) OR ("discountType" IS NULL))),
    CONSTRAINT "invoices_invoiceType_check" CHECK (("invoiceType" = ANY (ARRAY['quotation'::text, 'invoice'::text]))),
    CONSTRAINT "invoices_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1]))),
    CONSTRAINT invoices_status_check CHECK ((status = ANY (ARRAY['unpaid'::text, 'open'::text, 'closed'::text, 'partially'::text, 'paid'::text]))),
    CONSTRAINT "invoices_surchargeType_check" CHECK ((("surchargeType" = ANY (ARRAY['fixed'::text, 'percentage'::text])) OR ("surchargeType" IS NULL))),
    CONSTRAINT "invoices_taxType_check" CHECK ((("taxType" = ANY (ARRAY['exclusive'::text, 'inclusive'::text, 'deducted'::text])) OR ("taxType" IS NULL)))
);

ALTER TABLE invoices ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME invoices_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE items (
    id integer NOT NULL,
    name text NOT NULL,
    amount text DEFAULT '0'::text NOT NULL,
    "unitId" integer,
    "categoryId" integer,
    description text,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "items_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE items ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME items_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE layouts (
    id integer NOT NULL,
    schema text NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "layouts_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE layouts ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME layouts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE presets (
    id integer NOT NULL,
    name text NOT NULL,
    "businessId" integer,
    "clientId" integer,
    "currencyId" integer,
    "bankId" integer,
    "customerNotes" text,
    "thanksNotes" text,
    "termsConditionNotes" text,
    language text,
    "signatureData" bytea,
    "signatureName" text,
    "signatureType" text,
    "signatureSize" integer,
    "styleProfilesId" integer,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "presets_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE presets ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME presets_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE settings (
    id integer NOT NULL,
    language text DEFAULT 'en'::text NOT NULL,
    "amountFormat" text DEFAULT 'en-US'::text NOT NULL,
    "dateFormat" text DEFAULT 'MM/dd/yyyy'::text NOT NULL,
    "isDarkMode" integer DEFAULT 1 NOT NULL,
    "invoicePrefix" text,
    "invoiceSuffix" text,
    "shouldIncludeYear" integer DEFAULT 1 NOT NULL,
    "shouldIncludeMonth" integer DEFAULT 1 NOT NULL,
    "shouldIncludeBusinessName" integer DEFAULT 1 NOT NULL,
    "quotesON" integer DEFAULT 1 NOT NULL,
    "reportsON" integer DEFAULT 1 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "styleProfilesON" integer DEFAULT 1 NOT NULL,
    "presetsON" integer DEFAULT 1 NOT NULL,
    "ublON" integer DEFAULT 1 NOT NULL,
    "xrechnungON" integer DEFAULT 1 NOT NULL,
    "receiptPrintingOn" integer DEFAULT 1 NOT NULL,
    CONSTRAINT "settings_isDarkMode_check" CHECK (("isDarkMode" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_presetsON_check" CHECK (("presetsON" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_quotesON_check" CHECK (("quotesON" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_receiptPrintingOn_check" CHECK (("receiptPrintingOn" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_reportsON_check" CHECK (("reportsON" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_shouldIncludeBusinessName_check" CHECK (("shouldIncludeBusinessName" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_shouldIncludeMonth_check" CHECK (("shouldIncludeMonth" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_shouldIncludeYear_check" CHECK (("shouldIncludeYear" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_styleProfilesON_check" CHECK (("styleProfilesON" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_ublON_check" CHECK (("ublON" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "settings_xrechnungON_check" CHECK (("xrechnungON" = ANY (ARRAY[0, 1])))
);

ALTER TABLE settings ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME settings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE style_profiles (
    id integer NOT NULL,
    name text NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    color text,
    "logoSize" text,
    "fontSize" text,
    "tableHeaderStyle" text,
    "tableRowStyle" text,
    "pageFormat" text,
    "labelUpperCase" integer DEFAULT 0 NOT NULL,
    "watermarkFileName" text,
    "watermarkFileType" text,
    "watermarkFileSize" integer,
    "watermarkFileData" bytea,
    "paidWatermarkFileName" text,
    "paidWatermarkFileType" text,
    "paidWatermarkFileSize" integer,
    "paidWatermarkFileData" bytea,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    "showQuantity" integer DEFAULT 1 NOT NULL,
    "showUnit" integer DEFAULT 1 NOT NULL,
    "showRowNo" integer DEFAULT 1 NOT NULL,
    "fieldSortOrders" text DEFAULT '{"no":0,"item":1,"unit":2,"quantity":3,"unitCost":4,"total":5}'::text NOT NULL,
    "fontFamily" text,
    "pdfTexts" text,
    "layoutId" integer,
    CONSTRAINT "style_profiles_customizationLabelUpperCase_check" CHECK (("labelUpperCase" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "style_profiles_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "style_profiles_showQuantity_check" CHECK (("showQuantity" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "style_profiles_showRowNo_check" CHECK (("showRowNo" = ANY (ARRAY[0, 1]))),
    CONSTRAINT "style_profiles_showUnit_check" CHECK (("showUnit" = ANY (ARRAY[0, 1])))
);

ALTER TABLE style_profiles ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME style_profiles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

CREATE TABLE units (
    id integer NOT NULL,
    name text NOT NULL,
    "isArchived" integer DEFAULT 0 NOT NULL,
    "createdAt" timestamp without time zone DEFAULT now() NOT NULL,
    "updatedAt" timestamp without time zone DEFAULT now() NOT NULL,
    CONSTRAINT "units_isArchived_check" CHECK (("isArchived" = ANY (ARRAY[0, 1])))
);

ALTER TABLE units ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME units_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);

ALTER TABLE ONLY attachments
    ADD CONSTRAINT attachments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY banks
    ADD CONSTRAINT banks_name_key UNIQUE (name);

ALTER TABLE ONLY banks
    ADD CONSTRAINT banks_pkey PRIMARY KEY (id);

ALTER TABLE ONLY businesses
    ADD CONSTRAINT businesses_pkey PRIMARY KEY (id);

ALTER TABLE ONLY categories
    ADD CONSTRAINT categories_name_key UNIQUE (name);

ALTER TABLE ONLY categories
    ADD CONSTRAINT categories_pkey PRIMARY KEY (id);

ALTER TABLE ONLY clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);

ALTER TABLE ONLY currencies
    ADD CONSTRAINT currencies_code_key UNIQUE (code);

ALTER TABLE ONLY currencies
    ADD CONSTRAINT currencies_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_bank_snapshots
    ADD CONSTRAINT invoice_bank_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_business_snapshots
    ADD CONSTRAINT invoice_business_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_client_snapshots
    ADD CONSTRAINT invoice_client_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_currency_snapshots
    ADD CONSTRAINT invoice_currency_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_customizations
    ADD CONSTRAINT invoice_customizations_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_item_snapshots
    ADD CONSTRAINT invoice_item_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_items
    ADD CONSTRAINT invoice_items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_layout_snapshots
    ADD CONSTRAINT "invoice_layout_snapshots_parentInvoiceId_key" UNIQUE ("parentInvoiceId");

ALTER TABLE ONLY invoice_layout_snapshots
    ADD CONSTRAINT invoice_layout_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_payments
    ADD CONSTRAINT invoice_payments_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_sequences
    ADD CONSTRAINT invoice_sequences_business_client_type_unique UNIQUE ("businessId", "clientId", "invoiceType");

ALTER TABLE ONLY invoice_sequences
    ADD CONSTRAINT invoice_sequences_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoice_style_profile_snapshots
    ADD CONSTRAINT invoice_style_profile_snapshots_pkey PRIMARY KEY (id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT invoices_businessid_invoicefullnumber_clientid_invoicetype_key UNIQUE ("businessId", "invoiceFullNumber", "clientId", "invoiceType");

ALTER TABLE ONLY invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);

ALTER TABLE ONLY items
    ADD CONSTRAINT items_pkey PRIMARY KEY (id);

ALTER TABLE ONLY layouts
    ADD CONSTRAINT layouts_pkey PRIMARY KEY (id);

ALTER TABLE ONLY presets
    ADD CONSTRAINT presets_name_key UNIQUE (name);

ALTER TABLE ONLY presets
    ADD CONSTRAINT presets_pkey PRIMARY KEY (id);

ALTER TABLE ONLY settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);

ALTER TABLE ONLY style_profiles
    ADD CONSTRAINT style_profiles_name_key UNIQUE (name);

ALTER TABLE ONLY style_profiles
    ADD CONSTRAINT style_profiles_pkey PRIMARY KEY (id);

ALTER TABLE ONLY units
    ADD CONSTRAINT units_name_key UNIQUE (name);

ALTER TABLE ONLY units
    ADD CONSTRAINT units_pkey PRIMARY KEY (id);

CREATE INDEX idx_attachments_invoiceid ON attachments USING btree ("parentInvoiceId");

CREATE INDEX idx_banks_active ON banks USING btree ("isArchived");

CREATE INDEX idx_banks_bankname_accountnumber ON banks USING btree ("bankName", "accountNumber");

CREATE INDEX idx_businesses_active ON businesses USING btree ("isArchived");

CREATE INDEX idx_categories_active ON categories USING btree ("isArchived");

CREATE INDEX idx_clients_active ON clients USING btree ("isArchived");

CREATE INDEX idx_currencies_active ON currencies USING btree ("isArchived");

CREATE INDEX idx_invoice_bank_snapshots_parentinvoiceid ON invoice_bank_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_business_snapshots_businessname ON invoice_business_snapshots USING btree ("businessName");

CREATE INDEX idx_invoice_business_snapshots_businessshortname ON invoice_business_snapshots USING btree ("businessShortName");

CREATE INDEX idx_invoice_business_snapshots_parentinvoiceid ON invoice_business_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_client_snapshots_clientcode ON invoice_client_snapshots USING btree ("clientCode");

CREATE INDEX idx_invoice_client_snapshots_clientname ON invoice_client_snapshots USING btree ("clientName");

CREATE INDEX idx_invoice_client_snapshots_parentinvoiceid ON invoice_client_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_currency_snapshots_currencycode ON invoice_currency_snapshots USING btree ("currencyCode");

CREATE INDEX idx_invoice_currency_snapshots_parentinvoiceid ON invoice_currency_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_customizations_parentinvoiceid ON invoice_customizations USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_item_snapshots_itemname ON invoice_item_snapshots USING btree ("itemName");

CREATE INDEX idx_invoice_item_snapshots_parentinvoiceitemid ON invoice_item_snapshots USING btree ("parentInvoiceItemId");

CREATE INDEX idx_invoice_items_invoiceid ON invoice_items USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_items_itemid ON invoice_items USING btree ("itemId");

CREATE INDEX idx_invoice_layout_snapshots_parentinvoiceid ON invoice_layout_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_payments_invoiceid ON invoice_payments USING btree ("parentInvoiceId");

CREATE INDEX idx_invoice_style_profile_snapshots_parentinvoiceid ON invoice_style_profile_snapshots USING btree ("parentInvoiceId");

CREATE INDEX idx_invoices_active ON invoices USING btree ("isArchived");

CREATE INDEX idx_invoices_bankid ON invoices USING btree ("bankId");

CREATE INDEX idx_invoices_business_client ON invoices USING btree ("businessId", "clientId");

CREATE INDEX idx_invoices_businessid ON invoices USING btree ("businessId");

CREATE INDEX idx_invoices_clientid ON invoices USING btree ("clientId");

CREATE INDEX idx_invoices_convertedfromquotationid ON invoices USING btree ("convertedFromQuotationId");

CREATE INDEX idx_invoices_invoicenumber ON invoices USING btree ("invoiceNumber");

CREATE INDEX idx_invoices_issuedat ON invoices USING btree ("issuedAt");

CREATE INDEX idx_invoices_layoutid ON invoices USING btree ("layoutId");

CREATE INDEX idx_invoices_status ON invoices USING btree (status);

CREATE INDEX idx_invoices_styleprofilesid ON invoices USING btree ("styleProfilesId");

CREATE INDEX idx_invoices_type ON invoices USING btree ("invoiceType");

CREATE INDEX idx_items_active ON items USING btree ("isArchived");

CREATE INDEX idx_items_categoryid ON items USING btree ("categoryId");

CREATE INDEX idx_items_unitid ON items USING btree ("unitId");

CREATE INDEX idx_layouts_id ON layouts USING btree (id);

CREATE INDEX idx_style_profiles_active ON style_profiles USING btree ("isArchived");

CREATE INDEX idx_style_profiles_id ON style_profiles USING btree (id);

CREATE INDEX idx_style_profiles_layoutid ON style_profiles USING btree ("layoutId");

CREATE INDEX idx_units_active ON units USING btree ("isArchived");

ALTER TABLE ONLY attachments
    ADD CONSTRAINT "attachments_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_bank_snapshots
    ADD CONSTRAINT "invoice_bank_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_business_snapshots
    ADD CONSTRAINT "invoice_business_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_client_snapshots
    ADD CONSTRAINT "invoice_client_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_currency_snapshots
    ADD CONSTRAINT "invoice_currency_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_customizations
    ADD CONSTRAINT "invoice_customizations_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_item_snapshots
    ADD CONSTRAINT "invoice_item_snaphots_parentInvoiceItemId_fkey" FOREIGN KEY ("parentInvoiceItemId") REFERENCES invoice_items(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_items
    ADD CONSTRAINT "invoice_items_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES items(id);

ALTER TABLE ONLY invoice_items
    ADD CONSTRAINT "invoice_items_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_layout_snapshots
    ADD CONSTRAINT "invoice_layout_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_payments
    ADD CONSTRAINT "invoice_payments_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoice_style_profile_snapshots
    ADD CONSTRAINT "invoice_style_profile_snapshots_parentInvoiceId_fkey" FOREIGN KEY ("parentInvoiceId") REFERENCES invoices(id) ON DELETE CASCADE;

ALTER TABLE ONLY invoices
    ADD CONSTRAINT invoices_bankid_fkey FOREIGN KEY ("bankId") REFERENCES banks(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT "invoices_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES businesses(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT "invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES clients(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT "invoices_convertedFromQuotationId_fkey" FOREIGN KEY ("convertedFromQuotationId") REFERENCES invoices(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT "invoices_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES currencies(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT "invoices_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES layouts(id);

ALTER TABLE ONLY invoices
    ADD CONSTRAINT invoices_styleprofilesid_fkey FOREIGN KEY ("styleProfilesId") REFERENCES style_profiles(id);

ALTER TABLE ONLY items
    ADD CONSTRAINT "items_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES categories(id);

ALTER TABLE ONLY items
    ADD CONSTRAINT "items_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES units(id);

ALTER TABLE ONLY presets
    ADD CONSTRAINT "presets_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES banks(id) ON DELETE CASCADE;

ALTER TABLE ONLY presets
    ADD CONSTRAINT "presets_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES businesses(id) ON DELETE CASCADE;

ALTER TABLE ONLY presets
    ADD CONSTRAINT "presets_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES clients(id) ON DELETE CASCADE;

ALTER TABLE ONLY presets
    ADD CONSTRAINT "presets_currencyId_fkey" FOREIGN KEY ("currencyId") REFERENCES currencies(id) ON DELETE CASCADE;

ALTER TABLE ONLY presets
    ADD CONSTRAINT "presets_styleProfilesId_fkey" FOREIGN KEY ("styleProfilesId") REFERENCES style_profiles(id) ON DELETE CASCADE;

ALTER TABLE ONLY style_profiles
    ADD CONSTRAINT "style_profiles_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES layouts(id);

INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (1, 'USD', '$', 'United States Dollar', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (2, 'EUR', '€', 'Euro', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (3, 'SEK', 'kr', 'Swedish Krona', '{symbol} {amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (4, 'GBP', '£', 'British Pound', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (5, 'JPY', '¥', 'Japanese Yen', '{symbol}{amount}', 1, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (6, 'AUD', 'A$', 'Australian Dollar', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (7, 'CAD', 'CA$', 'Canadian Dollar', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (8, 'CHF', 'CHF', 'Swiss Franc', '{symbol} {amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (9, 'CNY', '¥', 'Chinese Yuan', '{symbol}{amount}', 100, 0, now(), now());
INSERT INTO currencies (id, code, symbol, text, format, subunit, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (10, 'INR', '₹', 'Indian Rupee', '{symbol}{amount}', 100, 0, now(), now());

INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (1, '{"schemaVersion":1,"meta":{"name":"Classic","description":"Pre-created layout using bank payment information for new invoices and quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"row","children":[{"type":"column","width":"50%","children":[{"type":"row","children":[{"type":"logo"},{"type":"businessInfo"}],"align":"start","justify":"between","gap":5}]},{"type":"column","width":"50%","children":[{"type":"invoiceMeta","showTitle":true}]}],"align":"start","justify":"between"},{"type":"row","children":[{"type":"clientInfo"}],"align":"start","justify":"between","paddingTop":20}]},{"type":"itemsTable","visible":true},{"type":"financialTotals","visible":true},{"type":"paymentInfo","visible":"auto"},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 0, now(), now());
INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (2, '{"schemaVersion":1,"meta":{"name":"Legacy Classic","description":"Pre-created legacy layout preserved for existing documents that use business payment information. Do not use for new invoices or quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"row","children":[{"type":"column","width":"50%","children":[{"type":"row","children":[{"type":"logo"},{"type":"businessInfo"}],"align":"start","justify":"between","gap":5}]},{"type":"column","width":"50%","children":[{"type":"invoiceMeta","showTitle":true}]}],"align":"start","justify":"between"},{"type":"row","children":[{"type":"column","width":"50%","children":[{"type":"clientInfo"}]},{"type":"column","width":"50%","align":"end","children":[{"type":"paymentInfo","paymentSource":"legacyBusiness","width":"60%"}]}],"align":"start","justify":"between","paddingTop":20}]},{"type":"itemsTable","visible":true,"columnSizing":"proportional"},{"type":"financialTotals","visible":true},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 1, now(), now());
INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (3, '{"schemaVersion":1,"meta":{"name":"Modern","description":"Pre-created layout using bank payment information for new invoices and quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"row","children":[{"type":"title"},{"type":"logo"}],"align":"start","justify":"between","paddingBottom":20},{"type":"row","children":[{"type":"businessInfo"},{"type":"invoiceMeta","boxed":true,"showInvoiceLabel":true}],"align":"start","justify":"between"},{"type":"row","children":[{"type":"clientInfo"}],"align":"start","justify":"between","paddingTop":20}]},{"type":"itemsTable","visible":true},{"type":"financialTotals","visible":true},{"type":"paymentInfo","visible":"auto"},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 0, now(), now());
INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (4, '{"schemaVersion":1,"meta":{"name":"Legacy Modern","description":"Pre-created legacy layout preserved for existing documents that use business payment information. Do not use for new invoices or quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"row","children":[{"type":"title"},{"type":"logo"}],"align":"start","justify":"between","paddingBottom":20},{"type":"row","children":[{"type":"column","width":"50%","children":[{"type":"businessInfo"}]},{"type":"column","width":"50%","children":[{"type":"invoiceMeta","showInvoiceLabel":true,"boxed":true}]}],"align":"start","justify":"between"},{"type":"row","children":[{"type":"column","width":"50%","children":[{"type":"clientInfo"}]},{"type":"column","width":"50%","align":"end","children":[{"type":"paymentInfo","paymentSource":"legacyBusiness","width":"60%"}]}],"align":"start","justify":"between","paddingTop":20}]},{"type":"itemsTable","visible":true,"columnSizing":"proportional"},{"type":"financialTotals","visible":true},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 1, now(), now());
INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (5, '{"schemaVersion":1,"meta":{"name":"Compact","description":"Pre-created layout using bank payment information for new invoices and quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"column","children":[{"type":"title"}],"align":"center","paddingBottom":20},{"type":"row","children":[{"type":"column","children":[{"type":"businessInfo"}],"width":"40%"},{"type":"column","children":[{"type":"clientInfo"}],"width":"40%"},{"type":"column","children":[{"type":"invoiceMeta","showInvoiceLabel":true}],"width":"20%"}],"align":"start","justify":"between","gap":10}]},{"type":"itemsTable","visible":true},{"type":"financialTotals","visible":true},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 0, now(), now());
INSERT INTO layouts (id, schema, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (6, '{"schemaVersion":1,"meta":{"name":"Legacy Compact","description":"Pre-created legacy layout preserved for existing documents that use business payment information. Do not use for new invoices or quotes."},"sections":[{"type":"watermark","visible":"auto","watermarkOrder":"paidFirst"},{"type":"header","visible":true,"blocks":[{"type":"column","children":[{"type":"title"}],"align":"center","paddingBottom":20},{"type":"row","children":[{"type":"column","children":[{"type":"businessInfo"}],"width":"40%"},{"type":"column","children":[{"type":"clientInfo"}],"width":"40%"},{"type":"column","children":[{"type":"invoiceMeta","showInvoiceLabel":true}],"width":"20%"}],"align":"start","justify":"between","gap":10}]},{"type":"itemsTable","visible":true,"columnSizing":"proportional"},{"type":"totalsRow","visible":true,"totalsBlocks":[{"type":"paymentInfo","paymentSource":"legacyBusiness"},{"type":"spacer"},{"type":"financialTotals"}]},{"type":"notes","visible":"auto"},{"type":"signature","visible":"auto"},{"type":"pageCounter","visible":true}]}', 1, now(), now());

INSERT INTO categories (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (1, 'Goods', 0, now(), now());
INSERT INTO categories (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (2, 'Services', 0, now(), now());

INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (1, 'pcs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (2, 'kgs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (3, 'gs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (4, 'lbs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (5, 'ozs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (6, 'ls', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (7, 'mls', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (8, 'ms', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (9, 'cms', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (10, 'fts', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (11, 'hrs', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (12, 'mins', 0, now(), now());
INSERT INTO units (id, name, "isArchived", "createdAt", "updatedAt") OVERRIDING SYSTEM VALUE VALUES (13, 'secs', 0, now(), now());

INSERT INTO settings (id, language, "amountFormat", "dateFormat", "isDarkMode", "invoicePrefix", "invoiceSuffix", "shouldIncludeYear", "shouldIncludeMonth", "shouldIncludeBusinessName", "quotesON", "reportsON", "createdAt", "updatedAt", "styleProfilesON", "presetsON", "ublON", "xrechnungON", "receiptPrintingOn") OVERRIDING SYSTEM VALUE VALUES (1, 'en', 'en-US', 'MM/dd/yyyy', 1, NULL, NULL, 1, 1, 1, 1, 1, now(), now(), 1, 1, 1, 1, 1);

SELECT pg_catalog.setval('categories_id_seq', 2, true);

SELECT pg_catalog.setval('currencies_id_seq', 10, true);

SELECT pg_catalog.setval('layouts_id_seq', 6, true);

SELECT pg_catalog.setval('settings_id_seq', 1, true);

SELECT pg_catalog.setval('units_id_seq', 13, true);

