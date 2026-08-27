-- Lets a sidebar be a pure, freeform dated-notes tab (e.g. a general
-- "Notes"/"Journal" page) with no findings grid at all — distinct from
-- includes_text_record, which just adds a notes section *underneath* a
-- findings-bearing sidebar (Greenhouse/Nitrate/Potassium keep that as-is).
-- A notes-only sidebar still sets includes_text_record = true (that's what
-- actually turns the text-record UI on); this flag additionally hides the
-- findings table for it.
alter table sidebars add column notes_only boolean not null default false;
