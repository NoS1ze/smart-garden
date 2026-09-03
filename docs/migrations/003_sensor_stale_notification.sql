-- Track when we last sent a "sensor may be dead" notification for a board,
-- so the stale-sensor check notifies once per outage instead of on every run.
alter table public.sensors
  add column if not exists last_stale_notified_at timestamptz;
