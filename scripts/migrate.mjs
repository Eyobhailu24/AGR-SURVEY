// Minimal migration runner. Applies db/migrations/*.sql in filename order,
// each in its own transaction, tracked in a schema_migrations table so
// re-running only applies what's new. No down-migrations by design — this
// is a small internal tool, forward-only is enough and keeps this simple.
//
// Usage: node --env-file=.env scripts/migrate.mjs

import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { Pool } from 'pg'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

async function main() {
  await pool.query(`
    create table if not exists schema_migrations (
      id text primary key,
      applied_at timestamptz not null default now()
    )
  `)

  const dir = path.join(process.cwd(), 'db', 'migrations')
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()

  const { rows } = await pool.query('select id from schema_migrations')
  const applied = new Set(rows.map((r) => r.id))

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`skip    ${file} (already applied)`)
      continue
    }
    const sql = await readFile(path.join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (id) values ($1)', [file])
      await client.query('commit')
      console.log(`applied ${file}`)
    } catch (error) {
      await client.query('rollback')
      console.error(`FAILED  ${file}`)
      throw error
    } finally {
      client.release()
    }
  }
}

main()
  .then(() => pool.end())
  .catch((error) => {
    console.error(error)
    pool.end().finally(() => process.exit(1))
  })
