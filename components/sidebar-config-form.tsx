'use client'

import { useId, useState } from 'react'
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  BUILTIN_COLUMNS,
  BUILTIN_IDS,
  COLUMN_TYPE_LABELS,
  CUSTOM_COLUMN_TYPES,
  DATE_COLUMN_ID,
  resolveView,
  sortDirectionLabel,
  type BuiltinId,
  type ColumnKind,
  type SidebarLayoutInput,
  type SortDir,
} from '@/lib/sidebar-view'
import type { ColumnField, Sidebar } from '@/lib/queries/sidebars'

// The one sidebar setup form, used step-by-step in the Add sidebar dialog
// and inline (same steps, save at any point) on the Manage sidebars page.

type DraftColumn = {
  uid: string
  builtin: BuiltinId | null
  /** Set for custom columns that already exist, so their saved values stay attached. */
  key: string | null
  label: string
  type: ColumnField['type']
  /** Choice options as typed: comma-separated. */
  options: string
  sortable: boolean
  filterable: boolean
}

export type SidebarDraft = {
  name: string
  description: string
  includesTextRecord: boolean
  notesOnly: boolean
  columns: DraftColumn[]
  sortUid: string
  sortDir: SortDir
}

export type SidebarFormPayload = {
  name: string
  description: string
  includesTextRecord: boolean
  notesOnly: boolean
} & SidebarLayoutInput

// Only used as React keys / form-local ids. A counter rather than
// crypto.randomUUID, which is missing on plain-http origins (e.g. opening the
// dev server from a phone over the LAN).
let uidCounter = 0
function newUid() {
  uidCounter += 1
  return `col-${uidCounter}`
}

function builtinColumn(builtin: BuiltinId, enabled = false): DraftColumn {
  return {
    uid: newUid(),
    builtin,
    key: null,
    label: BUILTIN_COLUMNS[builtin].label,
    type: 'text',
    options: '',
    sortable: enabled,
    filterable: enabled,
  }
}

function customColumn(): DraftColumn {
  return {
    uid: newUid(),
    builtin: null,
    key: null,
    label: '',
    type: 'text',
    options: '',
    sortable: false,
    filterable: false,
  }
}

function kindOf(column: DraftColumn): ColumnKind {
  return column.builtin ? BUILTIN_COLUMNS[column.builtin].kind : column.type
}

function nameOf(column: DraftColumn) {
  return column.label.trim() || 'New column'
}

function parseOptions(text: string) {
  return [...new Set(text.split(',').map((option) => option.trim()).filter(Boolean))]
}

export function emptySidebarDraft(): SidebarDraft {
  const date = builtinColumn(DATE_COLUMN_ID, true)
  return {
    name: '',
    description: '',
    includesTextRecord: true,
    notesOnly: false,
    columns: [date],
    sortUid: date.uid,
    sortDir: 'desc',
  }
}

export function sidebarToDraft(sidebar: Sidebar): SidebarDraft {
  const view = resolveView(sidebar)
  const columns = view.columns.map(
    (column): DraftColumn => ({
      uid: newUid(),
      builtin: column.builtin,
      key: column.field?.key ?? null,
      label: column.label,
      type: column.field?.type ?? 'text',
      options: column.field?.options?.join(', ') ?? '',
      sortable: column.sortable,
      filterable: column.filterable,
    }),
  )
  const sortIndex = view.columns.findIndex((column) => column.id === view.defaultSort.column)
  return {
    name: sidebar.name,
    description: sidebar.description ?? '',
    includesTextRecord: sidebar.includes_text_record,
    notesOnly: sidebar.notes_only,
    columns,
    sortUid: columns[Math.max(sortIndex, 0)].uid,
    sortDir: view.defaultSort.dir,
  }
}

function toPayload(draft: SidebarDraft): SidebarFormPayload {
  return {
    name: draft.name.trim(),
    description: draft.description.trim(),
    includesTextRecord: draft.includesTextRecord,
    notesOnly: draft.notesOnly,
    columns: draft.columns.map((column) => {
      const sortable = column.sortable || column.uid === draft.sortUid
      if (column.builtin) return { builtin: column.builtin, sortable, filterable: column.filterable }
      return {
        key: column.key,
        label: column.label.trim(),
        type: column.type,
        options: column.type === 'select' ? parseOptions(column.options) : undefined,
        sortable,
        filterable: column.filterable,
      }
    }),
    defaultSort: {
      index: Math.max(
        draft.columns.findIndex((column) => column.uid === draft.sortUid),
        0,
      ),
      dir: draft.sortDir,
    },
  }
}

const FILTER_HINTS: Record<ColumnKind, string> = {
  date: 'date range',
  number: 'min – max range',
  select: 'pick one of its options',
  lookup: 'pick from the list',
  text: 'contains text',
}

const STEPS = ['Details', 'Columns', 'Sort & filter']

function stepError(draft: SidebarDraft, step: number): string | null {
  if (step === 0) return draft.name.trim() ? null : 'Give the sidebar a name'
  if (step !== 1 || draft.notesOnly) return null
  const seen = new Set<string>()
  for (const column of draft.columns) {
    const label = column.label.trim()
    if (!label) return 'Every column needs a name'
    if (!column.builtin && column.type === 'select' && parseOptions(column.options).length === 0) {
      return `Add at least one option to the "${label}" choice column`
    }
    if (seen.has(label.toLowerCase())) return `Two columns are named "${label}" — give each a different name`
    seen.add(label.toLowerCase())
  }
  return null
}

export function SidebarConfigForm({
  initial,
  mode,
  submitting,
  onSubmit,
  onCancel,
}: {
  initial: SidebarDraft
  mode: 'create' | 'edit'
  submitting: boolean
  onSubmit: (payload: SidebarFormPayload) => void
  onCancel: () => void
}) {
  const idBase = useId()
  const [draft, setDraft] = useState(initial)
  const [step, setStep] = useState(0)
  const [focusUid, setFocusUid] = useState<string | null>(null)

  const steps = draft.notesOnly ? STEPS.slice(0, 1) : STEPS
  const lastStep = steps.length - 1
  const currentStep = Math.min(step, lastStep)
  const hiddenBuiltins = BUILTIN_IDS.filter((id) => !draft.columns.some((column) => column.builtin === id))
  const sortColumn = draft.columns.find((column) => column.uid === draft.sortUid)

  function patch(next: Partial<SidebarDraft>) {
    setDraft((d) => ({ ...d, ...next }))
  }
  function patchColumn(uid: string, next: Partial<DraftColumn>) {
    setDraft((d) => ({ ...d, columns: d.columns.map((c) => (c.uid === uid ? { ...c, ...next } : c)) }))
  }
  function insertColumn(at: number, column: DraftColumn) {
    setDraft((d) => {
      const columns = [...d.columns]
      columns.splice(at, 0, column)
      return { ...d, columns }
    })
    if (!column.builtin) setFocusUid(column.uid)
  }
  function moveColumn(index: number, delta: -1 | 1) {
    setDraft((d) => {
      const target = index + delta
      if (target < 0 || target >= d.columns.length) return d
      const columns = [...d.columns]
      ;[columns[index], columns[target]] = [columns[target], columns[index]]
      return { ...d, columns }
    })
  }
  function removeColumn(uid: string) {
    setDraft((d) => {
      const columns = d.columns.filter((c) => c.uid !== uid)
      const sortUid =
        d.sortUid === uid ? (columns.find((c) => c.builtin === DATE_COLUMN_ID)?.uid ?? columns[0]?.uid ?? '') : d.sortUid
      return { ...d, columns, sortUid }
    })
  }

  function firstProblem(throughStep: number) {
    for (let s = 0; s <= throughStep; s++) {
      const error = stepError(draft, s)
      if (error) return { step: s, error }
    }
    return null
  }
  function goTo(target: number) {
    if (target > currentStep) {
      const problem = firstProblem(target - 1)
      if (problem) {
        setStep(problem.step)
        toast.error(problem.error)
        return
      }
    }
    setStep(target)
  }
  function submit() {
    const problem = firstProblem(lastStep)
    if (problem) {
      setStep(problem.step)
      toast.error(problem.error)
      return
    }
    onSubmit(toPayload(draft))
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {steps.length > 1 && (
        <ol className="flex flex-wrap gap-2">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                onClick={() => goTo(index)}
                aria-current={index === currentStep ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                  index === currentStep
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="flex size-4 items-center justify-center rounded-full bg-current/15 text-[10px]">
                  {index + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      )}

      {currentStep === 0 && (
        <div className="flex flex-col gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor={`${idBase}-name`}>Name</Label>
            <Input
              id={`${idBase}-name`}
              value={draft.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="e.g. Phosphorus lab test"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${idBase}-description`}>Description (optional)</Label>
            <Textarea
              id={`${idBase}-description`}
              value={draft.description}
              onChange={(e) => patch({ description: e.target.value })}
              rows={2}
            />
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div>
              <p className="text-sm font-medium">Text records only</p>
              <p className="text-xs text-muted-foreground">
                A dated notes page with no findings table — e.g. a general journal that isn&apos;t tied to a specific
                test.
              </p>
            </div>
            <Switch checked={draft.notesOnly} onCheckedChange={(notesOnly) => patch({ notesOnly })} />
          </div>
          {!draft.notesOnly && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div>
                <p className="text-sm font-medium">Include a text record</p>
                <p className="text-xs text-muted-foreground">A rich-text note per day, separate from per-row notes.</p>
              </div>
              <Switch
                checked={draft.includesTextRecord}
                onCheckedChange={(includesTextRecord) => patch({ includesTextRecord })}
              />
            </div>
          )}
          {mode === 'edit' && draft.notesOnly && !initial.notesOnly && (
            <p className="text-xs text-muted-foreground">
              This hides the findings table. Its columns and saved findings are kept, so turning this off again brings
              them back.
            </p>
          )}
        </div>
      )}

      {currentStep === 1 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Columns appear in the table in this order. Use the arrows to move a column and{' '}
            <Plus className="inline size-3" /> to insert a new column right below it.
          </p>
          <ul className="flex flex-col gap-2">
            {draft.columns.map((column, index) => {
              const isDate = column.builtin === DATE_COLUMN_ID
              const name = nameOf(column)
              return (
                <li key={column.uid} className="rounded-lg border border-border p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} up`}
                        disabled={index === 0}
                        onClick={() => moveColumn(index, -1)}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Move ${name} down`}
                        disabled={index === draft.columns.length - 1}
                        onClick={() => moveColumn(index, 1)}
                      >
                        <ArrowDown />
                      </Button>
                    </div>
                    {column.builtin ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm">
                        <span className="truncate font-medium">{column.label}</span>
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Built-in
                        </span>
                      </div>
                    ) : (
                      <>
                        <Input
                          aria-label="Column name"
                          placeholder="Column name, e.g. Nitrate (NO3)"
                          className="min-w-40 flex-1"
                          autoFocus={column.uid === focusUid}
                          value={column.label}
                          onChange={(e) => patchColumn(column.uid, { label: e.target.value })}
                        />
                        <Select
                          value={column.type}
                          onValueChange={(type: ColumnField['type'] | null) => type && patchColumn(column.uid, { type })}
                        >
                          <SelectTrigger className="w-28" aria-label={`${name} type`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CUSTOM_COLUMN_TYPES.map((type) => (
                              <SelectItem key={type} value={type}>
                                {COLUMN_TYPE_LABELS[type]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </>
                    )}
                    <div className="ml-auto flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Insert a column below ${name}`}
                        onClick={() => insertColumn(index + 1, customColumn())}
                      >
                        <Plus />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={isDate ? 'Date is always included' : `Delete ${name}`}
                        title={isDate ? 'Date is always included' : undefined}
                        className="hover:text-destructive"
                        disabled={isDate}
                        onClick={() => removeColumn(column.uid)}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </div>
                  {!column.builtin && column.type === 'select' && (
                    <Input
                      className="mt-2"
                      aria-label={`${name} options`}
                      placeholder="Options, separated by commas — e.g. Clay, Loam, Sand"
                      value={column.options}
                      onChange={(e) => patchColumn(column.uid, { options: e.target.value })}
                    />
                  )}
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => insertColumn(draft.columns.length, customColumn())}
            >
              <Plus data-icon="inline-start" />
              Add column
            </Button>
            {hiddenBuiltins.length > 0 && <span className="text-xs text-muted-foreground">Built-in:</span>}
            {hiddenBuiltins.map((id) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="xs"
                onClick={() => insertColumn(draft.columns.length, builtinColumn(id))}
              >
                <Plus data-icon="inline-start" />
                {BUILTIN_COLUMNS[id].label}
              </Button>
            ))}
          </div>
          {mode === 'edit' && (
            <p className="text-xs text-muted-foreground">
              Renaming a column or changing its type keeps the values already saved in it. Deleting a column removes
              it from the table; its saved values stay in the database.
            </p>
          )}
        </div>
      )}

      {currentStep === 2 && (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Choose which of this sidebar&apos;s columns its table can be sorted and filtered by.
          </p>
          <div className="overflow-hidden rounded-lg border border-border">
            <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 bg-muted/60 px-3 py-2 text-xs uppercase tracking-wider text-muted-foreground">
              <span>Column</span>
              <span className="w-12 text-center">Sort</span>
              <span className="w-12 text-center">Filter</span>
            </div>
            {draft.columns.map((column) => {
              const isDefault = column.uid === draft.sortUid
              const name = nameOf(column)
              return (
                <div
                  key={column.uid}
                  className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-t border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{name}</p>
                    <p className="text-xs text-muted-foreground">Filter: {FILTER_HINTS[kindOf(column)]}</p>
                  </div>
                  <span className="flex w-12 justify-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={`Allow sorting by ${name}`}
                      title={isDefault ? 'The default sort column is always sortable' : undefined}
                      checked={column.sortable || isDefault}
                      disabled={isDefault}
                      onChange={(e) => patchColumn(column.uid, { sortable: e.target.checked })}
                    />
                  </span>
                  <span className="flex w-12 justify-center">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      aria-label={`Allow filtering by ${name}`}
                      checked={column.filterable}
                      onChange={(e) => patchColumn(column.uid, { filterable: e.target.checked })}
                    />
                  </span>
                </div>
              )
            })}
          </div>
          <div className="grid gap-1.5">
            <Label>Default sort</Label>
            <div className="flex flex-wrap gap-2">
              <Select value={draft.sortUid} onValueChange={(sortUid: string | null) => sortUid && patch({ sortUid })}>
                <SelectTrigger className="min-w-40" aria-label="Default sort column">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {draft.columns
                    .filter((column) => column.sortable || column.uid === draft.sortUid)
                    .map((column) => (
                      <SelectItem key={column.uid} value={column.uid}>
                        {nameOf(column)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Select value={draft.sortDir} onValueChange={(sortDir: SortDir | null) => sortDir && patch({ sortDir })}>
                <SelectTrigger className="min-w-36" aria-label="Default sort direction">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="desc">{sortDirectionLabel(sortColumn ? kindOf(sortColumn) : 'date', 'desc')}</SelectItem>
                  <SelectItem value="asc">{sortDirectionLabel(sortColumn ? kindOf(sortColumn) : 'date', 'asc')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">The table opens sorted this way. Only sortable columns are listed.</p>
          </div>
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        {mode === 'create' ? (
          <>
            {currentStep > 0 && (
              <Button type="button" variant="outline" onClick={() => goTo(currentStep - 1)}>
                Back
              </Button>
            )}
            {currentStep < lastStep ? (
              <Button type="button" onClick={() => goTo(currentStep + 1)}>
                Next
              </Button>
            ) : (
              <Button type="button" onClick={submit} disabled={submitting}>
                {submitting ? 'Adding…' : 'Add sidebar'}
              </Button>
            )}
          </>
        ) : (
          <Button type="button" onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Save changes'}
          </Button>
        )}
      </div>
    </div>
  )
}
