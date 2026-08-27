import { Pool, types } from 'pg'

// `date` columns (finding_date, record_date, ...) are stored and used
// app-wide as plain 'YYYY-MM-DD' strings. pg's default type parser would
// otherwise convert them to JS Date objects, which both breaks callers
// expecting a string (e.g. dateOnly()'s .slice()) and risks off-by-one-day
// bugs from timezone conversion on a value that has no time component.
types.setTypeParser(types.builtins.DATE, (value) => value)

export const pool = new Pool({ connectionString: process.env.DATABASE_URL })
