-- 씨네꼼 예약 앱 — Supabase Postgres schema
-- Dates are stored as plain DATE / minutes-from-midnight in KST (Asia/Seoul).

-- Raw cafe posts (one row per crawled article, across all boards via menu 0).
create table if not exists posts (
  article_id    bigint primary key,
  menu_id       int         not null,
  menu_name     text        not null,
  subject       text        not null,
  writer_nick   text        not null default '',
  write_ts      timestamptz not null,           -- original post time (epoch from API)
  is_reservation boolean    not null default false,
  parse_status  text        not null default 'unparsed', -- unparsed | ok | needs_review | not_reservation
  first_seen    timestamptz not null default now(),
  last_seen     timestamptz not null default now()
);

-- Parsed showings (one row per showing; a post can yield 0..2).
create table if not exists slots (
  id           bigserial primary key,
  article_id   bigint      not null references posts(article_id) on delete cascade,
  room         text        not null,             -- 대상영실 | 소상영실 | 상영실 | 꼼방
  date         date        not null,             -- KST calendar date of the showing
  start_min    int,                              -- minutes from midnight (may exceed 1440 for overnight); null = unknown time (needs_review)
  end_min      int,
  movie        text,
  person       text,
  canceled     boolean     not null default false,  -- (취소) marker or reconciled-missing
  needs_review boolean     not null default false,
  confidence   real        not null default 1
);

create index if not exists slots_date_room_idx on slots (date, room);
create index if not exists slots_article_idx on slots (article_id);
create index if not exists posts_write_ts_idx on posts (write_ts desc);
