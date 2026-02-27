# Database Migration Task: Renaming Plant Types to Species & Sensor Enhancements

The following SQL changes are required to rename "Plant Types" to "Plant Species" and enhance "Sensors" management.

## 1. Rename `plant_types` to `plant_species`

```sql
-- Rename the table
ALTER TABLE plant_types RENAME TO plant_species;

-- Rename foreign key column in plants table
ALTER TABLE plants RENAME COLUMN plant_type_id TO plant_species_id;
```

## 2. Enhance `sensors` table

```sql
-- Add sensor_type column
ALTER TABLE sensors ADD COLUMN sensor_type TEXT;
```

## 3. Clean up `plants` table (if `species` column still exists)

```sql
-- If there is a legacy species text column, migrate it first
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='plants' AND column_name='species') THEN
        -- Insert unique species names into plant_species table
        INSERT INTO plant_species (name)
        SELECT DISTINCT species FROM plants
        WHERE species IS NOT NULL AND species <> ''
        ON CONFLICT (name) DO NOTHING;

        -- Link plants to the plant_species table
        UPDATE plants p
        SET plant_species_id = ps.id
        FROM plant_species ps
        WHERE p.species = ps.name;

        -- Drop the old species column
        ALTER TABLE plants DROP COLUMN species;
    END IF;
END $$;
```
