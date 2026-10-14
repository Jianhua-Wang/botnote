-- botnote_touch_updated_at used to overwrite updated_at on every UPDATE, so
-- nothing could ever restore a historical timestamp: the sequence trigger's
-- counter bump on projects (0026) stamped "now" on every project that
-- received an imported entity, and a workspace import could not round-trip
-- projects.updated_at. The function now leaves updated_at alone when the
-- statement itself changed it, and keeps stamping now() otherwise.
--
-- Expand-only: 0.2.x code only ever writes updated_at = now(), which this
-- version treats exactly as before. Same signature, same triggers.
CREATE OR REPLACE FUNCTION botnote_touch_updated_at() RETURNS trigger AS $$
BEGIN
  IF NEW.updated_at IS DISTINCT FROM OLD.updated_at THEN
    RETURN NEW;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
