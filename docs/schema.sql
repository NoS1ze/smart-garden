-- Smart Garden IoT — Supabase Schema
-- Run this in your Supabase project: Dashboard → SQL Editor → New query → paste → Run

create table if not exists sensors (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  mac_address  text unique,
  display_name text,
  location     text not null,
  sensor_type  text, -- e.g., 'soil', 'ambient', 'all-in-one'
  created_at   timestamptz not null default now()
);

create table if not exists readings (
  id          uuid primary key default gen_random_uuid(),
  sensor_id   uuid not null references sensors(id) on delete cascade,
  metric      text not null check (metric in ('temperature','humidity','soil_moisture','light_lux','co2_ppm','pressure_hpa')),
  value       float not null,
  recorded_at timestamptz not null
);

create table if not exists alerts (
  id          uuid primary key default gen_random_uuid(),
  sensor_id   uuid not null references sensors(id) on delete cascade,
  metric      text not null check (metric in ('temperature','humidity','soil_moisture','light_lux','co2_ppm','pressure_hpa')),
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

create table if not exists soil_types (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  raw_dry    int not null default 800,
  raw_wet    int not null default 400,
  created_at timestamptz not null default now()
);

create table if not exists plant_species (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null unique,
  min_temp             float,
  max_temp             float,
  optimal_min_temp     float,
  optimal_max_temp     float,
  min_humidity         float,
  max_humidity         float,
  optimal_min_humidity float,
  optimal_max_humidity float,
  min_moisture         float,
  max_moisture         float,
  optimal_min_moisture float,
  optimal_max_moisture float,
  min_light            float,
  max_light            float,
  optimal_min_light    float,
  optimal_max_light    float,
  min_co2              float,
  max_co2              float,
  optimal_min_co2      float,
  optimal_max_co2      float,
  min_pressure         float,
  max_pressure         float,
  optimal_min_pressure float,
  optimal_max_pressure float,
  created_at           timestamptz not null default now()
);

create table if not exists plants (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  planted_date     date,
  photo_url        text,
  notes            text,
  soil_type_id     uuid references soil_types(id) on delete set null,
  plant_species_id uuid references plant_species(id) on delete set null,
  created_at       timestamptz not null default now()
);

create table if not exists sensor_plant (
  sensor_id   uuid not null references sensors(id) on delete cascade,
  plant_id    uuid not null references plants(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (sensor_id, plant_id)
);

-- Indexes for common query patterns
create index if not exists readings_sensor_metric_time on readings (sensor_id, metric, recorded_at desc);
create index if not exists alerts_sensor_active on alerts (sensor_id, active);
create index if not exists alert_history_alert_time on alert_history (alert_id, triggered_at desc);
