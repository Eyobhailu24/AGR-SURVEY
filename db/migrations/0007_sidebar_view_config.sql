-- Per-sidebar table layout, chosen in the Add/Edit sidebar flow: the order
-- of visible columns (built-in finding fields and the sidebar's own
-- column_schema entries, freely interleaved), which of them can be sorted
-- and filtered, and the default sort. Shape: see lib/sidebar-view.ts.
-- Nullable on purpose: null means "the layout every sidebar had before this
-- existed", derived in code, so existing sidebars need no backfill.
alter table sidebars add column view_config jsonb;
