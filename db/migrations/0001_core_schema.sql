-- Core domain schema: lookups, user-defined sidebars, findings, text records,
-- app-level users/roles, and the audit trail. See db/migrations/README.md.

create table sample_types (
  id serial primary key,
  key text not null unique,
  label text not null,
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table measurement_types (
  id serial primary key,
  key text not null unique,
  label text not null,
  unit text,
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now()
);

create table sidebars (
  id serial primary key,
  name text not null,
  slug text not null unique,
  icon text,
  description text,
  includes_text_record boolean not null default true,
  column_schema jsonb not null default '[]',
  is_archived boolean not null default false,
  sort_order int not null default 0,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table findings (
  id bigserial primary key,
  sidebar_id int not null references sidebars (id) on delete restrict,
  finding_date date not null,
  sample_id text not null default '',
  sample_type_id int references sample_types (id) on delete set null,
  measurement_type_id int references measurement_types (id) on delete set null,
  measurement_group text not null default '',
  values jsonb not null default '{}',
  apparatus text not null default '',
  notes text not null default '',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index findings_sidebar_date_id_idx on findings (sidebar_id, finding_date desc, id desc);
create index findings_sidebar_sample_type_idx on findings (sidebar_id, sample_type_id);
create index findings_sidebar_measurement_type_idx on findings (sidebar_id, measurement_type_id, finding_date desc);

create table text_records (
  id serial primary key,
  sidebar_id int not null references sidebars (id) on delete restrict,
  record_date date not null,
  body text not null default '',
  created_by text,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sidebar_id, record_date)
);

-- App-level identity: kept independent of the Auth.js adapter tables (0002)
-- so role/approval logic never depends on adapter-internal integer ids.
create table app_users (
  email text primary key,
  display_name text,
  role text not null default 'pending'
    check (role in ('pending', 'reader', 'editor', 'super_admin', 'revoked')),
  approved_by text,
  approved_at timestamptz,
  created_at timestamptz not null default now()
);

create table audit_log (
  id bigserial primary key,
  actor_email text,
  actor_name text,
  action text not null,
  entity_type text not null,
  entity_id text,
  diff jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on audit_log (created_at desc);
create index audit_log_actor_created_at_idx on audit_log (actor_email, created_at desc);
create index audit_log_entity_idx on audit_log (entity_type, entity_id);
