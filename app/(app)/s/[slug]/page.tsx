import { notFound } from 'next/navigation'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { listFindings } from '@/lib/queries/findings'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { getSessionWithRole } from '@/lib/auth-guard'
import { SidebarWorkspace } from '@/components/sidebar-workspace'
import { NotesWorkspace } from '@/components/notes-workspace'

const PAGE_SIZE = 15

export default async function SidebarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar || sidebar.is_archived) notFound()

  const { role } = await getSessionWithRole()
  const canEdit = role === 'editor' || role === 'super_admin'

  if (sidebar.notes_only) {
    return <NotesWorkspace sidebar={sidebar} canEdit={canEdit} />
  }

  const [page, sampleTypes, measurementTypes] = await Promise.all([
    // No sort given: starts on the sidebar's own default sort.
    listFindings({ sidebar, limit: PAGE_SIZE }),
    listSampleTypes(),
    listMeasurementTypes(),
  ])

  return (
    <SidebarWorkspace
      // Fresh sort/filter/paging state per sidebar when navigating between them.
      key={sidebar.id}
      sidebar={sidebar}
      initialPage={page}
      sampleTypes={sampleTypes}
      measurementTypes={measurementTypes}
      canEdit={canEdit}
      pageSize={PAGE_SIZE}
    />
  )
}
