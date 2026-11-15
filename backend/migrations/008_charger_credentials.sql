DELETE FROM chargers;

ALTER TABLE chargers
    ADD COLUMN password_hash text NOT NULL,
    ALTER COLUMN charge_point_model DROP NOT NULL,
    ALTER COLUMN charge_point_vendor DROP NOT NULL;