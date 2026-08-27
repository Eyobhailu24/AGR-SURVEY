import { TextRecordsPanel } from '@/components/text-records-panel'
import type { Sidebar } from '@/lib/queries/sidebars'

// The whole page for a notes-only sidebar (see AddSidebarDialog's "Text
// records only" toggle) — no findings grid, filters, or pagination, just
// the dated notes for this tab.
export function NotesWorkspace({ sidebar, canEdit }: { sidebar: Sidebar; canEdit: boolean }) {
  return (
    <>
      <div>
        {sidebar.description && (
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{sidebar.description}</p>
        )}
        <h2 className="mt-1 font-serif text-3xl font-semibold">{sidebar.name}</h2>
      </div>
      <TextRecordsPanel apiBase={`/api/sidebars/${sidebar.slug}`} slug={sidebar.slug} canEdit={canEdit} />
    </>
  )
}
