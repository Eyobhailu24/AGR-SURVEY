'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, Plus, Save, Trash2, X } from 'lucide-react'
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
import type { Finding, FindingsPage } from '@/lib/queries/findings'
import type { LookupRow } from '@/lib/queries/lookups'
import {
  resolveView,
  sortDirectionLabel,
  type FindingsFilter,
  type SortDir,
  type ViewColumn,
} from '@/lib/sidebar-view'

// Per-column floors so the table (wrapped in an overflow-x-auto container)
// scrolls sideways once the columns need more room than the viewport has,
// instead of every column being squeezed down to fit — inputs/selects will
// happily shrink to near-nothing otherwise, which is what made the table
// feel congested.
function columnMinWidth(column: ViewColumn) {
  if (column.builtin === 'notes') return 'min-w-80'
  switch (column.kind) {
    case 'date':
      return 'min-w-36'
    case 'number':
      return 'min-w-28'
    case 'select':
      return 'min-w-36'
    case 'lookup':
      return 'min-w-40'
    default:
      return 'min-w-40'
  }
}

function headerLabel(column: ViewColumn) {
  return column.field?.unit ? `${column.label} (${column.field.unit})` : column.label
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

type FilterInput = { value?: string; from?: string; to?: string }

function toFilters(inputs: Record<string, FilterInput>): FindingsFilter[] {
  return Object.entries(inputs).flatMap(([column, input]) => {
    const value = input.value?.trim()
    const from = input.from?.trim()
    const to = input.to?.trim()
    if (!value && !from && !to) return []
    return [{ column, ...(value ? { value } : {}), ...(from ? { from } : {}), ...(to ? { to } : {}) }]
  })
}

function Editable({
  value,
  onChange,
  type = 'text',
  inputMode,
  readOnly,
  label,
}: {
  value: string
  onChange: (v: string) => void
  type?: string
  inputMode?: 'decimal'
  readOnly?: boolean
  label: string
}) {
  if (readOnly) return <span className="block px-2 py-2 text-sm">{value || '—'}</span>
  return (
    <input
      type={type}
      inputMode={inputMode}
      aria-label={label}
      className="w-full bg-transparent px-2 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus:bg-primary/5"
      value={value}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

const FILTER_INPUT_CLASS = 'h-7 rounded-lg border border-input bg-transparent px-2 text-sm'

function ColumnFilter({
  column,
  input,
  onChange,
  sampleTypes,
  measurementTypes,
}: {
  column: ViewColumn
  input: FilterInput
  onChange: (patch: FilterInput) => void
  sampleTypes: LookupRow[]
  measurementTypes: LookupRow[]
}) {
  let control: React.ReactNode
  if (column.kind === 'date' || column.kind === 'number') {
    const isDate = column.kind === 'date'
    control = (
      <>
        <input
          type={isDate ? 'date' : 'number'}
          aria-label={`${column.label} from`}
          placeholder={isDate ? undefined : 'min'}
          className={cn(FILTER_INPUT_CLASS, !isDate && 'w-20')}
          value={input.from ?? ''}
          max={isDate ? input.to || undefined : undefined}
          onChange={(e) => onChange({ from: e.target.value })}
        />
        <span className="text-xs text-muted-foreground">to</span>
        <input
          type={isDate ? 'date' : 'number'}
          aria-label={`${column.label} to`}
          placeholder={isDate ? undefined : 'max'}
          className={cn(FILTER_INPUT_CLASS, !isDate && 'w-20')}
          value={input.to ?? ''}
          min={isDate ? input.from || undefined : undefined}
          onChange={(e) => onChange({ to: e.target.value })}
        />
      </>
    )
  } else if (column.kind === 'select' || column.kind === 'lookup') {
    const options =
      column.kind === 'select'
        ? (column.field?.options ?? []).map((option) => ({ value: option, label: option }))
        : (column.builtin === 'sample_type' ? sampleTypes : measurementTypes).map((row) => ({
            value: String(row.id),
            label: row.label,
          }))
    control = (
      <Select
        value={input.value || '__all__'}
        onValueChange={(v: string | null) => onChange({ value: !v || v === '__all__' ? '' : v })}
      >
        <SelectTrigger size="sm" className="min-w-32" aria-label={`Filter by ${column.label}`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else {
    control = (
      <input
        type="search"
        aria-label={`Filter ${column.label}`}
        placeholder="Contains…"
        className={cn(FILTER_INPUT_CLASS, 'w-36')}
        value={input.value ?? ''}
        onChange={(e) => onChange({ value: e.target.value })}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{column.label}</span>
      {control}
    </div>
  )
}

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
  const view = useMemo(() => resolveView(sidebar), [sidebar])
  const [findings, setFindings] = useState<Finding[]>(() => initialPage.rows.map(normalizeFinding))
  const [totalCount, setTotalCount] = useState(initialPage.totalCount)
  const [sampleTypes, setSampleTypes] = useState(initialSampleTypes)
  const [measurementTypes, setMeasurementTypes] = useState(initialMeasurementTypes)
  const [savingId, setSavingId] = useState<number | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Finding | null>(null)
  const [lookupDialog, setLookupDialog] = useState<'sample_type' | 'measurement_type' | null>(null)

  const [sort, setSort] = useState<{ column: string; dir: SortDir }>(view.defaultSort)
  const [filterInputs, setFilterInputs] = useState<Record<string, FilterInput>>({})
  const [filters, setFilters] = useState<FindingsFilter[]>([])
  // cursors[i] is the cursor that was used to fetch page i (undefined for page 0).
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [nextCursor, setNextCursor] = useState<string | null>(initialPage.nextCursor)
  const [loading, setLoading] = useState(false)
  const skipInitialFetch = useRef(true)

  const apiBase = `/api/sidebars/${sidebar.slug}`
  const sortableColumns = view.columns.filter((c) => c.sortable)
  const filterableColumns = view.columns.filter((c) => c.filterable)
  const sortColumn = view.columns.find((c) => c.id === sort.column) ?? view.columns[0]
  const hasFilterInput = Object.values(filterInputs).some((f) => f.value || f.from || f.to)

  async function fetchPage(cursor: string | undefined, targetPageIndex: number) {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(pageSize), sort: sort.column, dir: sort.dir })
      if (cursor) params.set('cursor', cursor)
      if (filters.length) params.set('filters', JSON.stringify(filters))
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

  // Filter inputs settle briefly before they apply, so typing into a
  // "contains" box doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = toFilters(filterInputs)
      setFilters((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next))
    }, 300)
    return () => clearTimeout(timer)
  }, [filterInputs])

  // Sort or filter changed: always restart at page 1. Skipped on mount — the
  // server already rendered page 1 for the default sort with no filters.
  const filtersKey = JSON.stringify(filters)
  useEffect(() => {
    if (skipInitialFetch.current) {
      skipInitialFetch.current = false
      return
    }
    setCursors([undefined])
    fetchPage(undefined, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sort.column, sort.dir, filtersKey])

  function toggleSortFromHeader(column: ViewColumn) {
    setSort((prev) =>
      prev.column === column.id
        ? { column: column.id, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { column: column.id, dir: column.kind === 'date' || column.kind === 'number' ? 'desc' : 'asc' },
    )
  }
  function setFilterInput(columnId: string, patch: FilterInput) {
    setFilterInputs((all) => ({ ...all, [columnId]: { ...all[columnId], ...patch } }))
  }

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
  function refetchFirstPage() {
    // New or imported rows could land anywhere in the sort order — safest to
    // just go back to page 1 rather than guess where they'd show up.
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
      refetchFirstPage()
    } catch {
      toast.error('Could not add finding')
    }
  }

  function renderCell(column: ViewColumn, finding: Finding) {
    switch (column.builtin) {
      case 'finding_date':
        return (
          <Editable
            type="date"
            label={column.label}
            readOnly={!canEdit}
            value={dateOnly(finding.finding_date)}
            onChange={(v) => update(finding.id, { finding_date: v })}
          />
        )
      case 'sample_id':
      case 'measurement_group':
      case 'apparatus':
      case 'notes': {
        const field = column.builtin
        return (
          <Editable
            label={column.label}
            readOnly={!canEdit}
            value={finding[field]}
            onChange={(v) => update(finding.id, { [field]: v } as Partial<Finding>)}
          />
        )
      }
      case 'sample_type':
      case 'measurement_type': {
        const lookup = column.builtin
        const rows = lookup === 'sample_type' ? sampleTypes : measurementTypes
        const current = lookup === 'sample_type' ? finding.sample_type_id : finding.measurement_type_id
        if (!canEdit) {
          return <span className="block px-2 py-2">{rows.find((r) => r.id === current)?.label ?? '—'}</span>
        }
        return (
          <Select
            value={current ? String(current) : ''}
            onValueChange={(value) => {
              if (value === '__new__') {
                setLookupDialog(lookup)
                return
              }
              const id = value ? Number(value) : null
              update(finding.id, lookup === 'sample_type' ? { sample_type_id: id } : { measurement_type_id: id })
            }}
          >
            <SelectTrigger size="sm" className="w-full" aria-label={column.label}>
              <SelectValue placeholder="—" />
            </SelectTrigger>
            <SelectContent>
              {rows.map((r) => (
                <SelectItem key={r.id} value={String(r.id)}>
                  {r.label}
                  {r.unit ? ` (${r.unit})` : ''}
                </SelectItem>
              ))}
              <SelectSeparator />
              <SelectItem value="__new__">+ Add new…</SelectItem>
            </SelectContent>
          </Select>
        )
      }
    }

    const field = column.field!
    const raw = finding.values[field.key] ?? ''
    if (column.kind === 'select') {
      if (!canEdit) return <span className="block px-2 py-2 text-sm">{raw || '—'}</span>
      const options = field.options ?? []
      return (
        <Select
          value={raw}
          onValueChange={(v: string | null) => updateValue(finding.id, field.key, !v || v === '__clear__' ? '' : v)}
        >
          <SelectTrigger size="sm" className="w-full" aria-label={column.label}>
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {/* A value saved before its option was renamed/removed still shows. */}
            {raw && !options.includes(raw) && <SelectItem value={raw}>{raw}</SelectItem>}
            {options.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
            {raw && (
              <>
                <SelectSeparator />
                <SelectItem value="__clear__">Clear</SelectItem>
              </>
            )}
          </SelectContent>
        </Select>
      )
    }
    return (
      <Editable
        label={column.label}
        readOnly={!canEdit}
        type={column.kind === 'date' ? 'date' : 'text'}
        // Text (not type=number) so a cell can hold several replicate
        // readings like "150, 170, 190".
        inputMode={column.kind === 'number' ? 'decimal' : undefined}
        value={raw}
        onChange={(v) => updateValue(finding.id, field.key, v)}
      />
    )
  }

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
            sort={sort.column}
            dir={sort.dir}
            filters={filters}
            hasActiveFilter={filters.length > 0}
          />
          {canEdit && (
            <>
              <ImportCsvDialog sidebar={sidebar} apiBase={apiBase} onImported={refetchFirstPage} />
              <ImportImageDialog sidebar={sidebar} apiBase={apiBase} onImported={refetchFirstPage} />
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
          <Select
            value={sort.column}
            onValueChange={(v: string | null) => v && setSort((prev) => ({ column: v, dir: prev.dir }))}
          >
            <SelectTrigger size="sm" className="min-w-28" aria-label="Sort by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {sortableColumns.map((column) => (
                <SelectItem key={column.id} value={column.id}>
                  {column.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSort((prev) => ({ ...prev, dir: prev.dir === 'asc' ? 'desc' : 'asc' }))}
            aria-label={`Sort order: ${sortDirectionLabel(sortColumn.kind, sort.dir)}`}
          >
            {sort.dir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {sortDirectionLabel(sortColumn.kind, sort.dir)}
          </Button>
        </div>
        {filterableColumns.map((column) => (
          <ColumnFilter
            key={column.id}
            column={column}
            input={filterInputs[column.id] ?? {}}
            onChange={(patch) => setFilterInput(column.id, patch)}
            sampleTypes={sampleTypes}
            measurementTypes={measurementTypes}
          />
        ))}
        {hasFilterInput && (
          <Button variant="ghost" size="sm" onClick={() => setFilterInputs({})}>
            <X data-icon="inline-start" />
            Clear filters
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {view.columns.map((column) => {
                const active = sort.column === column.id
                return (
                  <th
                    key={column.id}
                    className={cn('p-3', columnMinWidth(column))}
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  >
                    {column.sortable ? (
                      <button
                        type="button"
                        className="flex items-center gap-1 uppercase hover:text-foreground"
                        onClick={() => toggleSortFromHeader(column)}
                      >
                        {headerLabel(column)}
                        {active && sort.dir === 'asc' && <ArrowUp className="size-3" />}
                        {active && sort.dir === 'desc' && <ArrowDown className="size-3" />}
                        {!active && <ArrowUpDown className="size-3 opacity-40" />}
                      </button>
                    ) : (
                      headerLabel(column)
                    )}
                  </th>
                )
              })}
              {canEdit && <th className="min-w-32 p-3">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {findings.map((finding) => (
              <tr key={finding.id} className="border-t border-border align-top">
                {view.columns.map((column) => (
                  <td key={column.id} className={cn('p-1', columnMinWidth(column))}>
                    {renderCell(column, finding)}
                  </td>
                ))}
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
            ))}
            {findings.length === 0 && (
              <tr>
                <td colSpan={view.columns.length + (canEdit ? 1 : 0)} className="p-6 text-center text-muted-foreground">
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
