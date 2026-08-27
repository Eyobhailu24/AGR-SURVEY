'use client'

import { useEffect, useState } from 'react'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { ExportMenu } from '@/components/export-menu'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { TextRecordsPanel } from '@/components/text-records-panel'
import { AddLookupDialog } from '@/components/add-lookup-dialog'
import { ImportCsvDialog } from '@/components/import-csv-dialog'
import { ImportImageDialog } from '@/components/import-image-dialog'
import { cn } from '@/lib/utils'
import type { Sidebar } from '@/lib/queries/sidebars'
import type { Finding, FindingsPage, FindingsSort } from '@/lib/queries/findings'
import type { LookupRow } from '@/lib/queries/lookups'

// Per-column floors so the table (wrapped in an overflow-x-auto container)
// scrolls sideways once the columns need more room than the viewport has,
// instead of every column being squeezed down to fit — inputs/selects will
// happily shrink to near-nothing otherwise, which is what made the table
// feel congested.
const COLUMN_MIN_WIDTH: Record<string, string> = {
  finding_date: 'min-w-36',
  sample_id: 'min-w-24',
  sample_type: 'min-w-36',
  measurement_type: 'min-w-44',
  measurement_group: 'min-w-32',
  values: 'min-w-48',
  apparatus: 'min-w-32',
  notes: 'min-w-80',
  actions: 'min-w-32',
}

function dateOnly(value: string) {
  return value.slice(0, 10)
}
function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// Notes used to be rich text (see git history); existing rows can still
// carry HTML markup even though the column is now a plain input — strip it
// on the way in so old entries display cleanly instead of showing raw tags.
function stripHtml(html: string) {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
function normalizeFinding(finding: Finding): Finding {
  return { ...finding, notes: stripHtml(finding.notes) }
}

function Editable({
  value,
  onChange,
  type = 'text',
  readOnly,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  readOnly?: boolean
  placeholder?: string
}) {
  if (readOnly) return <span className="block px-2 py-2 text-sm">{value || placeholder || '—'}</span>
  return (
    <input
      type={type}
      aria-label={placeholder ?? 'Editable value'}
      placeholder={placeholder}
      className="w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:bg-primary/5"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

const columnHelper = createColumnHelper<Finding>()

export function SidebarWorkspace({
  sidebar,
  initialPage,
  sampleTypes: initialSampleTypes,
  measurementTypes: initialMeasurementTypes,
  canEdit,
  pageSize,
}: {
  sidebar: Sidebar
  initialPage: FindingsPage
  sampleTypes: LookupRow[]
  measurementTypes: LookupRow[]
  canEdit: boolean
  pageSize: number
}) {
  const [findings, setFindings] = useState<Finding[]>(() => initialPage.rows.map(normalizeFinding))
  const [totalCount, setTotalCount] = useState(initialPage.totalCount)
  const [sampleTypes, setSampleTypes] = useState(initialSampleTypes)
  const [measurementTypes, setMeasurementTypes] = useState(initialMeasurementTypes)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Finding | null>(null)
  const [lookupDialog, setLookupDialog] = useState<'sample_type' | 'measurement_type' | null>(null)

  const [sorting, setSorting] = useState<SortingState>([{ id: 'finding_date', desc: true }])
  const [sampleTypeFilter, setSampleTypeFilter] = useState<string>('')
  const [measurementTypeFilter, setMeasurementTypeFilter] = useState<string>('')
  const [dateFromFilter, setDateFromFilter] = useState<string>('')
  const [dateToFilter, setDateToFilter] = useState<string>('')
  // cursors[i] is the cursor that was used to fetch page i (undefined for page 0).
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)

  const apiBase = `/api/sidebars/${sidebar.slug}`
  const sort: FindingsSort = sorting[0]?.id === 'sample_id' ? 'sample_id' : 'finding_date'
  const dir: 'asc' | 'desc' = sorting[0]?.desc === false ? 'asc' : 'desc'

  function setSortColumn(id: FindingsSort) {
    setSorting([{ id, desc: sorting[0]?.desc ?? true }])
  }
  function toggleSortDirection() {
    setSorting((prev) => [{ id: prev[0]?.id ?? 'finding_date', desc: !(prev[0]?.desc ?? true) }])
  }

  async function fetchPage(cursor: string | undefined, targetPageIndex: number) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(pageSize), sort, dir })
      if (cursor) params.set('cursor', cursor)
      if (sampleTypeFilter) params.set('sampleTypeId', sampleTypeFilter)
      if (measurementTypeFilter) params.set('measurementTypeId', measurementTypeFilter)
      if (dateFromFilter) params.set('dateFrom', dateFromFilter)
      if (dateToFilter) params.set('dateTo', dateToFilter)
      const response = await fetch(`${apiBase}/findings?${params}`)
      if (!response.ok) throw new Error('Could not load findings')
      const page: FindingsPage = await response.json()
      setFindings(page.rows.map(normalizeFinding))
      setTotalCount(page.totalCount)
      setNextCursor(page.nextCursor)
      setPageIndex(targetPageIndex)
    } catch {
      toast.error('Could not load findings')
    } finally {
      setLoading(false)
    }
  }

  // Sidebar identity change (navigating to a different /s/[slug]) resets to
  // the server-provided first page rather than re-fetching immediately.
  useEffect(() => {
    setFindings(initialPage.rows.map(normalizeFinding))
    setTotalCount(initialPage.totalCount)
    setNextCursor(initialPage.nextCursor)
    setCursors([undefined])
    setPageIndex(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebar.id])

  // Sort or filter changed: always restart at page 1.
  useEffect(() => {
    setCursors([undefined])
    fetchPage(undefined, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort, dir, sampleTypeFilter, measurementTypeFilter, dateFromFilter, dateToFilter])

  function goNext() {
    if (!nextCursor) return
    setCursors((all) => [...all.slice(0, pageIndex + 1), nextCursor])
    fetchPage(nextCursor, pageIndex + 1)
  }
  function goPrev() {
    if (pageIndex === 0) return
    fetchPage(cursors[pageIndex - 1], pageIndex - 1)
  }
  function refetchCurrentPage() {
    fetchPage(cursors[pageIndex], pageIndex)
  }
  function refetchAfterImport() {
    // Imported rows could land anywhere in the sort order — safest to just
    // go back to page 1 rather than guess where they'd show up.
    setCursors([undefined])
    fetchPage(undefined, 0)
  }

  function update(id: number, patch: Partial<Finding>) {
    setFindings((all) => all.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }
  function updateValue(id: number, key: string, value: string) {
    setFindings((all) => all.map((f) => (f.id === id ? { ...f, values: { ...f.values, [key]: value } } : f)))
  }

  async function save(row: Finding) {
    setSavingId(row.id)
    try {
      const response = await fetch(`${apiBase}/findings/${row.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(row),
      })
      if (!response.ok) throw new Error('Save failed')
      toast.success('Finding saved')
    } catch {
      toast.error('Could not save this finding')
    } finally {
      setSavingId(null)
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return
    try {
      const response = await fetch(`${apiBase}/findings/${deleteTarget.id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('Delete failed')
      toast.success('Finding deleted')
      refetchCurrentPage()
    } catch {
      toast.error('Could not delete this finding')
    } finally {
      setDeleteTarget(null)
    }
  }

  async function addFinding() {
    const values: Record<string, string> = {}
    for (const column of sidebar.column_schema) values[column.key] = ''
    try {
      const response = await fetch(`${apiBase}/findings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          finding_date: todayISO(),
          sample_id: '',
          measurement_group: '',
          values,
          apparatus: '',
          notes: '',
        }),
      })
      if (!response.ok) throw new Error('Could not add finding')
      toast.success('Finding added')
      // A brand-new row (today's date) sorts to the top under the default
      // finding_date-desc order, so page 1 is where it'll actually be seen.
      setCursors([undefined])
      fetchPage(undefined, 0)
    } catch {
      toast.error('Could not add finding')
    }
  }

  const columns = [
    columnHelper.accessor('finding_date', { header: 'Date' }),
    columnHelper.accessor('sample_id', { header: 'Sample' }),
    columnHelper.display({ id: 'sample_type', header: 'Sample type', enableSorting: false }),
    columnHelper.display({ id: 'measurement_type', header: 'Measurement type', enableSorting: false }),
    columnHelper.display({ id: 'measurement_group', header: 'Group', enableSorting: false }),
    columnHelper.display({ id: 'values', header: 'Measurements', enableSorting: false }),
    columnHelper.display({ id: 'apparatus', header: 'Apparatus', enableSorting: false }),
    columnHelper.display({ id: 'notes', header: 'Notes', enableSorting: false }),
    ...(canEdit ? [columnHelper.display({ id: 'actions', header: 'Actions', enableSorting: false })] : []),
  ]

  const table = useReactTable({
    data: findings,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => String(row.id),
    enableSortingRemoval: false,
  })

  const rangeStart = totalCount === 0 ? 0 : pageIndex * pageSize + 1
  const rangeEnd = Math.min(pageIndex * pageSize + findings.length, totalCount)

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          {sidebar.description && (
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">{sidebar.description}</p>
          )}
          <h2 className="mt-1 font-serif text-3xl font-semibold">{sidebar.name}</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu
            kind="findings"
            apiBase={apiBase}
            slug={sidebar.slug}
            sort={sort}
            dir={dir}
            sampleTypeId={sampleTypeFilter}
            measurementTypeId={measurementTypeFilter}
            dateFrom={dateFromFilter}
            dateTo={dateToFilter}
            hasActiveFilter={Boolean(sampleTypeFilter || measurementTypeFilter || dateFromFilter || dateToFilter)}
          />
          {canEdit && (
            <>
              <ImportCsvDialog sidebar={sidebar} apiBase={apiBase} onImported={refetchAfterImport} />
              <ImportImageDialog sidebar={sidebar} apiBase={apiBase} onImported={refetchAfterImport} />
              <Button onClick={addFinding}>
                <Plus data-icon="inline-start" />
                Add finding
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Sort by</span>
          <Select value={sort} onValueChange={(v: FindingsSort | null) => v && setSortColumn(v)}>
            <SelectTrigger size="sm" className="w-28" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="finding_date">Date</SelectItem>
              <SelectItem value="sample_id">Sample</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={toggleSortDirection}
            aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
          >
            {dir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {dir === 'asc' ? 'Asc' : 'Desc'}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Date</span>
          <input
            type="date"
            aria-label="From date"
            className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
            value={dateFromFilter}
            max={dateToFilter || undefined}
            onChange={(e) => setDateFromFilter(e.target.value)}
          />
          <span className="text-xs text-muted-foreground">to</span>
          <input
            type="date"
            aria-label="To date"
            className="rounded-lg border border-input bg-transparent px-2 py-1 text-sm"
            value={dateToFilter}
            min={dateFromFilter || undefined}
            onChange={(e) => setDateToFilter(e.target.value)}
          />
          {(dateFromFilter || dateToFilter) && (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Clear date filter"
              onClick={() => {
                setDateFromFilter('')
                setDateToFilter('')
              }}
            >
              ×
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Sample type</span>
          <Select
            value={sampleTypeFilter || 'all'}
            onValueChange={(v: string | null) => setSampleTypeFilter(!v || v === 'all' ? '' : v)}
          >
            <SelectTrigger size="sm" className="w-36" aria-label="Filter by sample type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {sampleTypes.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Measurement type</span>
          <Select
            value={measurementTypeFilter || 'all'}
            onValueChange={(v: string | null) => setMeasurementTypeFilter(!v || v === 'all' ? '' : v)}
          >
            <SelectTrigger size="sm" className="w-44" aria-label="Filter by measurement type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {measurementTypes.map((m) => (
                <SelectItem key={m.id} value={String(m.id)}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} className={cn('p-3', COLUMN_MIN_WIDTH[header.column.id])}>
                    {header.column.getCanSort() ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 hover:text-foreground"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {header.column.getIsSorted() === 'asc' && <ArrowUp className="size-3" />}
                        {header.column.getIsSorted() === 'desc' && <ArrowDown className="size-3" />}
                        {!header.column.getIsSorted() && <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const finding = row.original
              return (
                <tr key={finding.id} className="border-t border-border align-top">
                  <td className="p-1">
                    <Editable
                      type="date"
                      readOnly={!canEdit}
                      value={dateOnly(finding.finding_date)}
                      onChange={(v) => update(finding.id, { finding_date: v })}
                    />
                  </td>
                  <td className="p-1">
                    <Editable
                      readOnly={!canEdit}
                      value={finding.sample_id}
                      onChange={(v) => update(finding.id, { sample_id: v })}
                    />
                  </td>
                  <td className="p-1 min-w-36">
                    {canEdit ? (
                      <Select
                        value={finding.sample_type_id ? String(finding.sample_type_id) : ''}
                        onValueChange={(value) => {
                          if (value === '__new__') {
                            setLookupDialog('sample_type')
                            return
                          }
                          update(finding.id, { sample_type_id: value ? Number(value) : null })
                        }}
                      >
                        <SelectTrigger size="sm" className="w-full" aria-label="Sample type">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {sampleTypes.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.label}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value="__new__">+ Add new…</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="block px-2 py-2">
                        {sampleTypes.find((s) => s.id === finding.sample_type_id)?.label ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-1 min-w-36">
                    {canEdit ? (
                      <Select
                        value={finding.measurement_type_id ? String(finding.measurement_type_id) : ''}
                        onValueChange={(value) => {
                          if (value === '__new__') {
                            setLookupDialog('measurement_type')
                            return
                          }
                          update(finding.id, { measurement_type_id: value ? Number(value) : null })
                        }}
                      >
                        <SelectTrigger size="sm" className="w-full" aria-label="Measurement type">
                          <SelectValue placeholder="—" />
                        </SelectTrigger>
                        <SelectContent>
                          {measurementTypes.map((m) => (
                            <SelectItem key={m.id} value={String(m.id)}>
                              {m.label}
                              {m.unit ? ` (${m.unit})` : ''}
                            </SelectItem>
                          ))}
                          <SelectSeparator />
                          <SelectItem value="__new__">+ Add new…</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="block px-2 py-2">
                        {measurementTypes.find((m) => m.id === finding.measurement_type_id)?.label ?? '—'}
                      </span>
                    )}
                  </td>
                  <td className="p-1">
                    <Editable
                      readOnly={!canEdit}
                      value={finding.measurement_group}
                      onChange={(v) => update(finding.id, { measurement_group: v })}
                    />
                  </td>
                  <td className="p-1 min-w-40">
                    {sidebar.column_schema.map((column) => (
                      <Editable
                        key={column.key}
                        readOnly={!canEdit}
                        type={column.type === 'number' ? 'number' : column.type === 'date' ? 'date' : 'text'}
                        placeholder={column.label}
                        value={finding.values[column.key] ?? ''}
                        onChange={(v) => updateValue(finding.id, column.key, v)}
                      />
                    ))}
                    {sidebar.column_schema.length === 0 && <span className="text-xs text-muted-foreground">—</span>}
                  </td>
                  <td className="p-1">
                    <Editable
                      readOnly={!canEdit}
                      value={finding.apparatus}
                      onChange={(v) => update(finding.id, { apparatus: v })}
                    />
                  </td>
                  <td className="p-1">
                    <Editable
                      readOnly={!canEdit}
                      value={finding.notes}
                      onChange={(v) => update(finding.id, { notes: v })}
                    />
                  </td>
                  {canEdit && (
                    <td className="p-2">
                      <div className="flex gap-1">
                        <Button size="sm" onClick={() => save(finding)} disabled={savingId === finding.id}>
                          <Save data-icon="inline-start" />
                          {savingId === finding.id ? 'Saving' : 'Save'}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          aria-label="Delete finding"
                          onClick={() => setDeleteTarget(finding)}
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
            {findings.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 9 : 8} className="p-6 text-center text-muted-foreground">
                  {loading ? 'Loading…' : 'No findings match this view.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {totalCount === 0 ? 'No findings' : `Showing ${rangeStart}–${rangeEnd} of ${totalCount}`}
        </p>
        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button variant="outline" size="sm" onClick={goPrev} disabled={pageIndex === 0 || loading}>
                Previous
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button variant="outline" size="sm" onClick={goNext} disabled={!nextCursor || loading}>
                Next
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>

      {sidebar.includes_text_record && <TextRecordsPanel apiBase={apiBase} slug={sidebar.slug} canEdit={canEdit} />}

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this finding?</AlertDialogTitle>
            <AlertDialogDescription>This permanently removes the row. This can&apos;t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {lookupDialog && (
        <AddLookupDialog
          open={lookupDialog !== null}
          onOpenChange={(open) => !open && setLookupDialog(null)}
          kind={lookupDialog}
          onCreated={(row) => {
            if (lookupDialog === 'sample_type') setSampleTypes((all) => [...all, row])
            else setMeasurementTypes((all) => [...all, row])
          }}
        />
      )}
    </>
  )
}
