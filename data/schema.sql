-- JamNet — Supabase schema
-- Incolla nell'editor SQL di Supabase (Dashboard → SQL Editor → New Query)

-- ── Extensions ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";

-- ── Artists ────────────────────────────────────────────────────────────────
create table if not exists artists (
  mb_artist_id  text primary key,
  name          text not null,
  country       text,
  macro_area    text,
  bio_short     text,
  relevance     integer not null default 0,
  listeners     bigint,             -- segnale Last.fm grezzo (artist.getInfo)
  playcount     bigint,             -- segnale Last.fm grezzo (artist.getInfo)
  created_at    timestamptz not null default now()
);

create index if not exists artists_country_idx   on artists (country);
create index if not exists artists_macro_area_idx on artists (macro_area);

-- ── Tracks ─────────────────────────────────────────────────────────────────
create table if not exists tracks (
  id                  uuid primary key default uuid_generate_v4(),
  mb_recording_id     text unique,
  title               text not null,
  artist_name         text not null,
  artist_mb_id        text references artists (mb_artist_id) on delete set null,
  country             text,
  macro_area          text,
  year                integer,
  youtube_video_id    text,
  apple_music_id      text,                                  -- fonte audio primaria (MusicKit)
  itunes_track_id     text,
  itunes_preview_url  text,
  artwork_url         text,
  isrc                text,
  is_new_release      boolean not null default false,        -- decade "Now"
  tags                text[] not null default '{}',
  weight              integer not null default 1,            -- legacy: peso artista (compresso)
  quality_score       double precision,                      -- segnale di pesca per-brano (de-compresso)
  interest_score      double precision,                      -- Fase 2: interesse globale precalcolato (qualità+gem+distintività)
  track_listeners     bigint,                                -- segnale Last.fm per-brano (track.getInfo, opzionale)
  rand                double precision not null default random(),  -- chiave per campionamento profondo
  created_at          timestamptz not null default now()
);

create index if not exists tracks_macro_area_idx on tracks (macro_area);
create index if not exists tracks_country_idx    on tracks (country);
create index if not exists tracks_year_idx       on tracks (year);
create index if not exists tracks_weight_idx     on tracks (weight);
create index if not exists tracks_quality_idx    on tracks (quality_score);
create index if not exists tracks_rand_idx       on tracks (rand);
-- Composite indexes for the discovery draw: it filters by macro_area and scans a
-- random window via rand, so (macro_area, rand) turns the hot path into an
-- index-range scan instead of a filter-then-sort.
create index if not exists tracks_area_rand_idx      on tracks (macro_area, rand);
create index if not exists tracks_area_year_rand_idx on tracks (macro_area, year, rand);

-- ── Migrazioni per installazioni esistenti (idempotenti) ─────────────────────
-- `create table if not exists` non aggiunge colonne a una tabella già presente:
-- esegui questo blocco per allineare un DB esistente allo schema sopra.
alter table artists add column if not exists listeners       bigint;
alter table artists add column if not exists playcount       bigint;
alter table tracks  add column if not exists apple_music_id   text;
alter table tracks  add column if not exists is_new_release   boolean not null default false;
alter table tracks  add column if not exists quality_score    double precision;
alter table tracks  add column if not exists interest_score   double precision;
alter table tracks  add column if not exists track_listeners  bigint;
alter table tracks  add column if not exists rand             double precision;
update tracks set rand = random() where rand is null;
alter table tracks  alter column rand set default random();
alter table tracks  alter column rand set not null;
create index if not exists tracks_quality_idx        on tracks (quality_score);
create index if not exists tracks_rand_idx           on tracks (rand);
create index if not exists tracks_area_rand_idx      on tracks (macro_area, rand);
create index if not exists tracks_area_year_rand_idx on tracks (macro_area, year, rand);

-- ── Match reports ──────────────────────────────────────────────────────────
create table if not exists match_reports (
  id         uuid primary key default uuid_generate_v4(),
  track_id   uuid references tracks (id) on delete cascade,
  motivo     text not null check (motivo in ('wrong_video', 'wrong_metadata')),
  note       text,
  created_at timestamptz not null default now()
);

-- ── History ────────────────────────────────────────────────────────────────
-- user_id nullable: anonimo = null, viene riempito al login
create table if not exists history (
  id        uuid primary key default uuid_generate_v4(),
  user_id   uuid references auth.users (id) on delete cascade,
  track_id  uuid references tracks (id) on delete cascade,
  played_at timestamptz not null default now()
);

create index if not exists history_user_idx on history (user_id, played_at desc);

-- ── Likes ──────────────────────────────────────────────────────────────────
create table if not exists likes (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  track_id   uuid not null references tracks (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, track_id)
);

-- ── Playlists ──────────────────────────────────────────────────────────────
create table if not exists playlists (
  id         uuid primary key default uuid_generate_v4(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  type       text not null check (type in ('auto_area', 'auto_genre', 'custom')),
  hidden     boolean not null default false,
  share_token text unique default encode(gen_random_bytes(12), 'hex'),
  created_at timestamptz not null default now()
);

create index if not exists playlists_user_idx on playlists (user_id);

-- ── Playlist tracks ────────────────────────────────────────────────────────
create table if not exists playlist_tracks (
  id          uuid primary key default uuid_generate_v4(),
  playlist_id uuid not null references playlists (id) on delete cascade,
  track_id    uuid not null references tracks (id) on delete cascade,
  position    integer not null,
  unique (playlist_id, track_id)
);

create index if not exists playlist_tracks_playlist_idx on playlist_tracks (playlist_id, position);

-- ── RLS policies (anon può leggere tracks e artists) ──────────────────────
alter table tracks         enable row level security;
alter table artists        enable row level security;
alter table match_reports  enable row level security;
alter table history        enable row level security;
alter table likes          enable row level security;
alter table playlists      enable row level security;
alter table playlist_tracks enable row level security;

-- Tracks: lettura pubblica (anon key), scrittura solo da service role
create policy "tracks_read" on tracks for select using (true);

-- Artists: lettura pubblica
create policy "artists_read" on artists for select using (true);

-- Match reports: chiunque può inserire (anonimo o loggato)
create policy "match_reports_insert" on match_reports for insert with check (true);

-- History: lettura/scrittura solo dell'utente proprietario
create policy "history_select" on history for select using (auth.uid() = user_id);
create policy "history_insert" on history for insert with check (auth.uid() = user_id);

-- Likes: lettura/scrittura solo dell'utente proprietario
create policy "likes_select" on likes for select using (auth.uid() = user_id);
create policy "likes_insert" on likes for insert with check (auth.uid() = user_id);
create policy "likes_delete" on likes for delete using (auth.uid() = user_id);

-- Playlists: lettura/scrittura solo dell'utente proprietario
create policy "playlists_select" on playlists for select using (auth.uid() = user_id);
create policy "playlists_insert" on playlists for insert with check (auth.uid() = user_id);
create policy "playlists_update" on playlists for update using (auth.uid() = user_id);
create policy "playlists_delete" on playlists for delete using (auth.uid() = user_id);

-- Playlist tracks: stessa logica tramite join
create policy "playlist_tracks_select" on playlist_tracks for select
  using (exists (select 1 from playlists where playlists.id = playlist_id and playlists.user_id = auth.uid()));
create policy "playlist_tracks_insert" on playlist_tracks for insert
  with check (exists (select 1 from playlists where playlists.id = playlist_id and playlists.user_id = auth.uid()));
create policy "playlist_tracks_update" on playlist_tracks for update
  using (exists (select 1 from playlists where playlists.id = playlist_id and playlists.user_id = auth.uid()));
create policy "playlist_tracks_delete" on playlist_tracks for delete
  using (exists (select 1 from playlists where playlists.id = playlist_id and playlists.user_id = auth.uid()));
