-- Repair entities that point at themselves as their own parent.
--
-- The Letheia import wrote parent_id = id (and a matching parent_of self
-- edge) for 1034 notes, so listChildren and get_entity_by_key listed each
-- note as its own child. Data fix only, no schema change; both statements
-- are no-ops once applied, and the service now rejects self-parenting.

UPDATE entities SET parent_id = NULL WHERE parent_id = id;

DELETE FROM edges WHERE from_id = to_id;
