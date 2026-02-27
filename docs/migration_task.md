# Database Migration Task

The following SQL changes are required to support the new Plant Types system.

## 1. Create `plant_types` table

```sql
CREATE TABLE plant_types (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT UNIQUE NOT NULL,
    min_temp FLOAT,
    max_temp FLOAT,
    optimal_min_temp FLOAT,
    optimal_max_temp FLOAT,
    min_humidity FLOAT,
    max_humidity FLOAT,
    optimal_min_humidity FLOAT,
    optimal_max_humidity FLOAT,
    min_moisture FLOAT,
    max_moisture FLOAT,
    optimal_min_moisture FLOAT,
    optimal_max_moisture FLOAT,
    min_light FLOAT,
    max_light FLOAT,
    optimal_min_light FLOAT,
    optimal_max_light FLOAT,
    min_co2 FLOAT,
    max_co2 FLOAT,
    optimal_min_co2 FLOAT,
    optimal_max_co2 FLOAT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 2. Update `plants` table

```sql
-- Add plant_type_id foreign key
ALTER TABLE plants ADD COLUMN plant_type_id UUID REFERENCES plant_types(id) ON DELETE SET NULL;

-- Migrate existing species to plant_types table (optional but recommended)
INSERT INTO plant_types (name)
SELECT DISTINCT species FROM plants WHERE species IS NOT NULL
ON CONFLICT (name) DO NOTHING;

-- Link plants to the newly created plant_types
UPDATE plants p
SET plant_type_id = pt.id
FROM plant_types pt
WHERE p.species = pt.name;

-- Remove the old species column
ALTER TABLE plants DROP COLUMN species;
```
