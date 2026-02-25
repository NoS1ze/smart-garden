-- Smart Garden IoT — Supabase Schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run

create table if not exists sensors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  location    text not null,
  created_at  timestamptz not null default now()
);

create table if not exists readings (
  id          uuid primary key default gen_random_uuid(),
  sensor_id   uuid not null references sensors(id) on delete cascade,
  metric      text not null check (metric in ('temperature','humidity','soil_moisture','light_lux','co2_ppm')),
  value       float not null,
  recorded_at timestamptz not null
);

create table if not exists alerts (
  id          uuid primary key default gen_random_uuid(),
  sensor_id   uuid not null references sensors(id) on delete cascade,
  metric      text not null check (metric in ('temperature','humidity','soil_moisture','light_lux','co2_ppm')),
  condition   text not null check (condition in ('above','below')),
  threshold   float not null,
  email       text not null,
  active      boolean not null default true
);

create table if not exists alert_history (
  id               uuid primary key default gen_random_uuid(),
  alert_id         uuid not null references alerts(id) on delete cascade,
  triggered_at     timestamptz not null default now(),
  value_at_trigger float not null
);

-- Index for common query patterns
create index if not exists readings_sensor_metric_time on readings (sensor_id, metric, recorded_at desc);
create index if not exists alerts_sensor_active on alerts (sensor_id, active);
create index if not exists alert_history_alert_time on alert_history (alert_id, triggered_at desc);

-- Insert a test sensor to get started (replace name/location as needed)
-- insert into sensors (name, location) values ('Garden Bed A', 'Backyard');
-- After inserting, copy the generated UUID into firmware/soil_moisture/config.h as SENSOR_ID
