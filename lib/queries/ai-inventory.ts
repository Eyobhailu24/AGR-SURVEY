import { pool } from '@/lib/db'

export type SidebarCoverage = {
  sidebar_id: number
  finding_count: number
  first_date: string | null
  last_date: string | null
}

// Deliberately returns *coverage*, never values: how many rows each tab
// holds and the dates they span. That's enough for the assistant to say
// what data exists and to avoid claiming a period it has nothing for,
// without any measurement leaving the database. One grouped scan, backed
// by findings_sidebar_date_id_idx.
export async function getSidebarCoverage(): Promise<SidebarCoverage[]> {
  const result = await pool.query<{
    sidebar_id: number
    finding_count: string
    first_date: string | null
    last_date: string | null
  }>(
    `select sidebar_id,
            count(*)::text as finding_count,
            min(finding_date)::text as first_date,
            max(finding_date)::text as last_date
     from findings
     group by sidebar_id`,
  )
  return result.rows.map((r) => ({
    sidebar_id: r.sidebar_id,
    finding_count: Number(r.finding_count),
    first_date: r.first_date,
    last_date: r.last_date,
  }))
}
