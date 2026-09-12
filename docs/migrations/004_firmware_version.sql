-- Track which firmware build each board is running, so behaviour (battery life,
-- upload cadence, sensor quality) can be compared across firmware versions.
--
-- sensors.firmware_version  = what's running right now (updated on every POST)
-- firmware_history          = when it changed, so a range of readings can be
--                             attributed to the version that produced them

alter table public.sensors
  add column if not exists firmware_version text;

create table if not exists public.firmware_history (
  id               uuid primary key default gen_random_uuid(),
  sensor_id        uuid not null references public.sensors(id) on delete cascade,
  version          text not null,
  previous_version text,
  changed_at       timestamptz not null default now()
);

create index if not exists firmware_history_sensor_idx
  on public.firmware_history (sensor_id, changed_at desc);
