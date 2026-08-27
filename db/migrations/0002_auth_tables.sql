-- Auth.js (NextAuth v5) database-adapter schema, matching @auth/pg-adapter's
-- queries exactly (verified against node_modules/@auth/pg-adapter/index.js).
-- Do not rename columns/tables here without re-checking that file.

create table users (
  id serial primary key,
  name varchar(255),
  email varchar(255) unique,
  "emailVerified" timestamptz,
  image text
);

create table accounts (
  id serial primary key,
  "userId" integer not null references users (id) on delete cascade,
  type varchar(255) not null,
  provider varchar(255) not null,
  "providerAccountId" varchar(255) not null,
  refresh_token text,
  access_token text,
  expires_at bigint,
  id_token text,
  scope text,
  session_state text,
  token_type text,
  unique (provider, "providerAccountId")
);

create table sessions (
  id serial primary key,
  "userId" integer not null references users (id) on delete cascade,
  expires timestamptz not null,
  "sessionToken" varchar(255) not null unique
);

create table verification_token (
  identifier text not null,
  expires timestamptz not null,
  token text not null,
  primary key (identifier, token)
);

create index accounts_user_id_idx on accounts ("userId");
create index sessions_user_id_idx on sessions ("userId");
