-- One-time migration of the original research_findings table into the new
-- normalized findings table. Runs only if research_findings still exists
-- (so this migration file is safe to leave in place / re-run on a fresh DB
-- that never had the legacy table).
--
-- sample_type_id / measurement_type_id are intentionally left NULL: the
-- legacy schema never captured that distinction, and guessing would
-- fabricate provenance the original notebook didn't record. Review/tag
-- these rows once via the UI after migrating.
--
-- The legacy table is renamed, never dropped, by this script. Drop
-- research_findings_legacy yourself once you've confirmed the new pages
-- look right.

do $$
declare
  legacy_exists boolean;
begin
  select to_regclass('public.research_findings') is not null into legacy_exists;

  if legacy_exists then
    alter table research_findings rename to research_findings_legacy;

    insert into findings (
      sidebar_id, finding_date, sample_id, measurement_group, values, apparatus, notes,
      created_by, updated_by, created_at, updated_at
    )
    select
      s.id,
      l.finding_date,
      l.sample_id,
      l.measurement_group,
      l.values,
      l.apparatus,
      l.notes,
      'system:migration',
      'system:migration',
      coalesce(l.created_at, now()),
      coalesce(l.updated_at, now())
    from research_findings_legacy l
    join sidebars s on s.slug = l.section
    order by l.id asc;
  end if;
end $$;
