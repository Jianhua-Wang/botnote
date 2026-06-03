-- Per-project color + icon. Defaults match the Linear-ish indigo accent and a simple circle dot.
ALTER TABLE projects ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#5e6ad2';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT 'circle';
