import { notFound } from 'next/navigation'
import { getSidebarBySlug } from '@/lib/queries/sidebars'
import { listFindings } from '@/lib/queries/findings'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { getSessionWithRole } from '@/lib/auth-guard'
import { SidebarWorkspace } from '@/components/sidebar-workspace'

const PAGE_SIZE = 15

export default async function SidebarPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const sidebar = await getSidebarBySlug(slug)
  if (!sidebar || sidebar.is_archived) notFound()

  const [page, sampleTypes, measurementTypes, { role }] = await Promise.all([
    listFindings({ sidebarId: sidebar.id, limit: PAGE_SIZE, sort: 'finding_date', dir: 'desc' }),
    listSampleTypes(),
    listMeasurementTypes(),
    getSessionWithRole(),
  ])

  return (
    <SidebarWorkspace
      sidebar={sidebar}
      initialPage={page}
      sampleTypes={sampleTypes}
      measurementTypes={measurementTypes}
      canEdit={role === 'editor' || role === 'super_admin'}
      pageSize={PAGE_SIZE}
    />
  )
}
