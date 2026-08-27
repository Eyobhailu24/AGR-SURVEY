import { listSidebars } from '@/lib/queries/sidebars'
import { listMeasurementTypes, listSampleTypes } from '@/lib/queries/lookups'
import { getReportSummary, listReportFindings } from '@/lib/queries/reports'
import { ReportsWorkspace } from '@/components/reports-workspace'

const PAGE_SIZE = 15

export default async function ReportsPage() {
  const [allSidebars, sampleTypes, measurementTypes, summary, findingsPage] = await Promise.all([
    listSidebars(),
    listSampleTypes(),
    listMeasurementTypes(),
    getReportSummary({}),
    listReportFindings({}, { limit: PAGE_SIZE, sort: 'finding_date', dir: 'desc' }),
  ])
  // Notes-only tabs have no findings — irrelevant as a report filter/scope.
  const sidebars = allSidebars.filter((s) => !s.notes_only)

  return (
    <ReportsWorkspace
      sidebars={sidebars}
      sampleTypes={sampleTypes}
      measurementTypes={measurementTypes}
      initialSummary={summary}
      initialFindingsPage={findingsPage}
      pageSize={PAGE_SIZE}
    />
  )
}
