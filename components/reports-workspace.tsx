'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LabelList,
  type TooltipContentProps,
} from 'recharts'
import { ArrowDown, ArrowUp, BarChart3, CalendarRange, FileText, ListChecks } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Pagination, PaginationContent, PaginationItem } from '@/components/ui/pagination'
import { cn, formatDateDisplay } from '@/lib/utils'
import type { Sidebar } from '@/lib/queries/sidebars'
import type { LookupRow } from '@/lib/queries/lookups'
import type { FindingsSort } from '@/lib/queries/findings'
import type { ReportFinding, ReportFindingsPage, ReportSummary } from '@/lib/queries/reports'

const CHART_HUE = 'var(--color-chart-1)'
const seriesHue = (i: number) => `var(--color-chart-${(i % 8) + 1})`

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function ChartTooltip({ active, payload, label }: TooltipContentProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-md">
      {label != null && (
        <p className="mb-1 font-medium text-popover-foreground">{isIsoDate(label) ? formatDateDisplay(label) : label}</p>
      )}
      <div className="flex flex-col gap-0.5">
        {payload.map((entry) => (
          <div key={String(entry.dataKey)} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="font-semibold text-popover-foreground">{entry.value}</span>
            <span className="text-muted-foreground">{entry.name}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  )
}

function ChartCard({ title, className, children }: { title: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('flex flex-col gap-2 rounded-xl border border-border bg-card p-4', className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      {children}
    </div>
  )
}

function EmptyChart() {
  return <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">No data for this filter yet.</p>
}

// Magnitude-by-category (one measure, a nominal axis): one hue for every
// bar — the axis labels already carry identity, so a rainbow per bar would
// just double-encode the same information as color. See the dataviz skill's
// choosing-a-form guide: "compare magnitude -> sequential (one hue)".
function BreakdownBarChart({ data }: { data: { label: string; count: number }[] }) {
  if (data.length === 0) return <EmptyChart />
  const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 12 }
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36 + 16)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--color-border)" />
        <XAxis type="number" allowDecimals={false} tick={axisTick} axisLine={{ stroke: 'var(--color-border)' }} tickLine={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={132}
          tick={axisTick}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
          interval={0}
        />
        <Tooltip content={ChartTooltip} cursor={{ fill: 'var(--color-muted)' }} />
        <Bar dataKey="count" name="Findings" fill={CHART_HUE} radius={[0, 4, 4, 0]} maxBarSize={22}>
          <LabelList dataKey="count" position="right" fill="var(--color-muted-foreground)" fontSize={12} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

// Trend over time, one series: sequential/single-hue per the same rule.
function TrendChart({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0) return <EmptyChart />
  const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 12 }
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
        <CartesianGrid vertical={false} stroke="var(--color-border)" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDateDisplay}
          tick={axisTick}
          axisLine={{ stroke: 'var(--color-border)' }}
          tickLine={false}
          minTickGap={28}
        />
        <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
        <Tooltip content={ChartTooltip} />
        <Line
          type="monotone"
          dataKey="count"
          name="Findings"
          stroke={CHART_HUE}
          strokeWidth={2}
          dot={{ r: 3, fill: CHART_HUE, stroke: 'var(--color-card)', strokeWidth: 2 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

// Multiple named series over time -> identity is the job -> categorical,
// fixed slot order, legend always present for 2+ series.
function TrendByTestChart({
  series,
  points,
}: {
  series: { id: number; name: string }[]
  points: Record<string, string | number>[]
}) {
  if (points.length === 0 || series.length === 0) return <EmptyChart />
  const axisTick = { fill: 'var(--color-muted-foreground)', fontSize: 12 }
  return (
    <div className="flex flex-col gap-2">
      <ResponsiveContainer width="100%" height={260}>
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 4, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--color-border)" />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateDisplay}
            tick={axisTick}
            axisLine={{ stroke: 'var(--color-border)' }}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis allowDecimals={false} tick={axisTick} axisLine={false} tickLine={false} width={28} />
          <Tooltip content={ChartTooltip} />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={String(s.id)}
              name={s.name}
              stroke={seriesHue(i)}
              strokeWidth={2}
              dot={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      {series.length >= 2 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {series.map((s, i) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: seriesHue(i) }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportsWorkspace({
  sidebars,
  sampleTypes,
  measurementTypes,
  initialSummary,
  initialFindingsPage,
  pageSize,
}: {
  sidebars: Sidebar[]
  sampleTypes: LookupRow[]
  measurementTypes: LookupRow[]
  initialSummary: ReportSummary
  initialFindingsPage: ReportFindingsPage
  pageSize: number
}) {
  const [sidebarFilter, setSidebarFilter] = useState('')
  const [sampleTypeFilter, setSampleTypeFilter] = useState('')
  const [measurementTypeFilter, setMeasurementTypeFilter] = useState('')
  const [dateFromFilter, setDateFromFilter] = useState('')
  const [dateToFilter, setDateToFilter] = useState('')

  const [summary, setSummary] = useState(initialSummary)
  const [summaryLoading, setSummaryLoading] = useState(false)

  const [sort, setSort] = useState<FindingsSort>('finding_date')
  const [dir, setDir] = useState<'asc' | 'desc'>('desc')
  const [rows, setRows] = useState<ReportFinding[]>(initialFindingsPage.rows)
  const [totalCount, setTotalCount] = useState(initialFindingsPage.totalCount)
  const [nextCursor, setNextCursor] = useState<string | null>(initialFindingsPage.nextCursor)
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined])
  const [pageIndex, setPageIndex] = useState(0)
  const [tableLoading, setTableLoading] = useState(false)

  function filterParams() {
    const params = new URLSearchParams()
    if (sidebarFilter) params.set('sidebarId', sidebarFilter)
    if (sampleTypeFilter) params.set('sampleTypeId', sampleTypeFilter)
    if (measurementTypeFilter) params.set('measurementTypeId', measurementTypeFilter)
    if (dateFromFilter) params.set('dateFrom', dateFromFilter)
    if (dateToFilter) params.set('dateTo', dateToFilter)
    return params
  }

  async function loadSummary() {
    setSummaryLoading(true)
    try {
      const response = await fetch(`/api/reports/summary?${filterParams()}`)
      if (!response.ok) throw new Error('Could not load report summary')
      setSummary(await response.json())
    } catch {
      toast.error('Could not load the report summary')
    } finally {
      setSummaryLoading(false)
    }
  }

  async function loadFindings(cursor: string | undefined, targetPageIndex: number) {
    setTableLoading(true)
    try {
      const params = filterParams()
      params.set('limit', String(pageSize))
      params.set('sort', sort)
      params.set('dir', dir)
      if (cursor) params.set('cursor', cursor)
      const response = await fetch(`/api/reports/findings?${params}`)
      if (!response.ok) throw new Error('Could not load findings')
      const page: ReportFindingsPage = await response.json()
      setRows(page.rows)
      setTotalCount(page.totalCount)
      setNextCursor(page.nextCursor)
      setPageIndex(targetPageIndex)
    } catch {
      toast.error('Could not load findings')
    } finally {
      setTableLoading(false)
    }
  }

  useEffect(() => {
    loadSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarFilter, sampleTypeFilter, measurementTypeFilter, dateFromFilter, dateToFilter])

  useEffect(() => {
    setCursors([undefined])
    loadFindings(undefined, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sidebarFilter, sampleTypeFilter, measurementTypeFilter, dateFromFilter, dateToFilter, sort, dir])

  function goNext() {
    if (!nextCursor) return
    setCursors((all) => [...all.slice(0, pageIndex + 1), nextCursor])
    loadFindings(nextCursor, pageIndex + 1)
  }
  function goPrev() {
    if (pageIndex === 0) return
    loadFindings(cursors[pageIndex - 1], pageIndex - 1)
  }

  const rangeStart = totalCount === 0 ? 0 : pageIndex * pageSize + 1
  const rangeEnd = Math.min(pageIndex * pageSize + rows.length, totalCount)
  const numberFormat = new Intl.NumberFormat('en-US')
  const dateRangeLabel =
    summary.dateRange.min && summary.dateRange.max
      ? summary.dateRange.min === summary.dateRange.max
        ? formatDateDisplay(summary.dateRange.min)
        : `${formatDateDisplay(summary.dateRange.min)} – ${formatDateDisplay(summary.dateRange.max)}`
      : 'No data yet'

  return (
    <>
      <div>
        <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Across every test</p>
        <h2 className="mt-1 font-serif text-3xl font-semibold">Reports</h2>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">Test</span>
          <Select value={sidebarFilter || 'all'} onValueChange={(v: string | null) => setSidebarFilter(!v || v === 'all' ? '' : v)}>
            <SelectTrigger size="sm" className="w-40" aria-label="Filter by test">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tests</SelectItem>
              {sidebars.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          {(sidebarFilter || sampleTypeFilter || measurementTypeFilter || dateFromFilter || dateToFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSidebarFilter('')
                setSampleTypeFilter('')
                setMeasurementTypeFilter('')
                setDateFromFilter('')
                setDateToFilter('')
              }}
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {/* Refetches hold the previous render (dimmed) instead of flashing a
          skeleton or collapsing the layout — see the dataviz skill's
          interaction spec. */}
      <div className={cn('flex flex-col gap-5 transition-opacity', summaryLoading && 'opacity-60')}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Findings" value={numberFormat.format(summary.totalFindings)} icon={<ListChecks className="size-3.5" />} />
          <StatTile label="Text records" value={numberFormat.format(summary.totalTextRecords)} icon={<FileText className="size-3.5" />} />
          <StatTile label="Tests tracked" value={numberFormat.format(summary.bySidebar.length)} icon={<BarChart3 className="size-3.5" />} />
          <StatTile label="Date range" value={dateRangeLabel} icon={<CalendarRange className="size-3.5" />} />
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <ChartCard title="Findings over time">
            <TrendChart data={summary.overTime} />
          </ChartCard>
          <ChartCard title="Findings over time, by test">
            <TrendByTestChart series={summary.overTimeBySidebar.series} points={summary.overTimeBySidebar.points} />
          </ChartCard>
          <ChartCard title="Findings by test">
            <BreakdownBarChart data={summary.bySidebar.map((s) => ({ label: s.name, count: s.count }))} />
          </ChartCard>
          <ChartCard title="Findings by sample type">
            <BreakdownBarChart data={summary.bySampleType.map((s) => ({ label: s.label, count: s.count }))} />
          </ChartCard>
          <ChartCard title="Findings by measurement type" className="lg:col-span-2">
            <BreakdownBarChart data={summary.byMeasurementType.map((s) => ({ label: s.label, count: s.count }))} />
          </ChartCard>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">Sort by</span>
        <Select value={sort} onValueChange={(v: FindingsSort | null) => v && setSort(v)}>
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
          onClick={() => setDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={dir === 'asc' ? 'Sort ascending' : 'Sort descending'}
        >
          {dir === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
          {dir === 'asc' ? 'Asc' : 'Desc'}
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="min-w-36 p-3">Date</th>
              <th className="min-w-36 p-3">Test</th>
              <th className="min-w-24 p-3">Sample</th>
              <th className="min-w-36 p-3">Sample type</th>
              <th className="min-w-44 p-3">Measurement type</th>
              <th className="min-w-32 p-3">Group</th>
              <th className="min-w-32 p-3">Apparatus</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="p-3">{formatDateDisplay(row.finding_date)}</td>
                <td className="p-3">
                  <Link href={`/s/${row.sidebar_slug}`} className="text-primary hover:underline">
                    {row.sidebar_name}
                  </Link>
                </td>
                <td className="p-3">{row.sample_id || '—'}</td>
                <td className="p-3">{row.sample_type_label ?? '—'}</td>
                <td className="p-3">{row.measurement_type_label ?? '—'}</td>
                <td className="p-3">{row.measurement_group || '—'}</td>
                <td className="p-3">{row.apparatus || '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="p-6 text-center text-muted-foreground">
                  {tableLoading ? 'Loading…' : 'No findings match this view.'}
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
              <Button variant="outline" size="sm" onClick={goPrev} disabled={pageIndex === 0 || tableLoading}>
                Previous
              </Button>
            </PaginationItem>
            <PaginationItem>
              <Button variant="outline" size="sm" onClick={goNext} disabled={!nextCursor || tableLoading}>
                Next
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </>
  )
}
