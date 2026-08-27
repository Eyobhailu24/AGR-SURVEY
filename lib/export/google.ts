import { google } from 'googleapis'
import type { ExportTable } from './build-rows'
import { toCsv, toHtmlTable } from './formats'

// Deliberately the simple path: hand Drive a CSV/HTML blob with a Sheet/Doc
// mimeType and let Drive's own importer convert it, rather than building out
// the structured Sheets v4 / Docs v1 request objects. Gets a genuinely
// populated file (not the empty-file stub this replaced) with much less
// implementation surface; rich-text notes render as plain-ish text under
// this approach — revisit only if formatting fidelity becomes a real ask.

function oauthClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })
  return auth
}

export async function createGoogleSheet(accessToken: string, table: ExportTable): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: oauthClient(accessToken) })
  const file = await drive.files.create({
    requestBody: { name: `${table.title} export`, mimeType: 'application/vnd.google-apps.spreadsheet' },
    media: { mimeType: 'text/csv', body: toCsv(table) },
    fields: 'id,webViewLink',
  })
  return file.data.webViewLink ?? `https://docs.google.com/spreadsheets/d/${file.data.id}`
}

export async function createGoogleDoc(accessToken: string, table: ExportTable): Promise<string> {
  const drive = google.drive({ version: 'v3', auth: oauthClient(accessToken) })
  const file = await drive.files.create({
    requestBody: { name: `${table.title} export`, mimeType: 'application/vnd.google-apps.document' },
    media: { mimeType: 'text/html', body: toHtmlTable(table) },
    fields: 'id,webViewLink',
  })
  return file.data.webViewLink ?? `https://docs.google.com/document/d/${file.data.id}`
}
