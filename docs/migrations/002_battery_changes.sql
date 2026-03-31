-- Migration 002: battery_changes table
-- Preserves full history of battery replacements per sensor.
-- sensors.battery_changed_at still holds the latest date for quick access.
-- Run in Supabase: Dashboard → SQL Editor → New query → paste → Run

create table if not exists battery_changes (
  id         uuid primary key default gen_random_uuid(),
  sensor_id  uuid not null references sensors(id) on delete cascade,
  changed_at timestamptz not null default now()
);

create index if not exists battery_changes_sensor_id on battery_changes (sensor_id);
create index if not exists battery_changes_time      on battery_changes (changed_at desc);

-- Seed from existing battery_changed_at column (one-time migration)
insert into battery_changes (sensor_id, changed_at)
select id, battery_changed_at
from sensors
where battery_changed_at is not null;
