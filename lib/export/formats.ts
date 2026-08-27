import Papa from 'papaparse'
import ExcelJS from 'exceljs'
import { Document, HeadingLevel, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx'
import type { ExportTable } from './build-rows'

export function toCsv(table: ExportTable): string {
  return Papa.unparse({ fields: table.headers, data: table.rows })
}

export async function toXlsxBuffer(table: ExportTable): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet(table.title.slice(0, 31) || 'Findings')
  sheet.addRow(table.headers)
  sheet.getRow(1).font = { bold: true }
  sheet.getRow(1).eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEEEEE' } }
  })
  for (const row of table.rows) sheet.addRow(row)
  sheet.columns.forEach((col) => {
    col.width = 20
  })
  const buffer = await workbook.xlsx.writeBuffer()
  return Buffer.from(buffer)
}

export async function toDocxBuffer(table: ExportTable): Promise<Buffer> {
  const headerRow = new TableRow({
    children: table.headers.map(
      (h) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })] }),
    ),
  })
  const bodyRows = table.rows.map(
    (row) => new TableRow({ children: row.map((cell) => new TableCell({ children: [new Paragraph(cell)] })) }),
  )
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({ text: table.title, heading: HeadingLevel.HEADING_1 }),
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [headerRow, ...bodyRows] }),
        ],
      },
    ],
  })
  return Packer.toBuffer(doc)
}

export function toHtmlTable(table: ExportTable): string {
  const esc = (v: string) => v.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const header = `<tr>${table.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`
  const rows = table.rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')
  return `<html><body><h1>${esc(table.title)}</h1><table border="1">${header}${rows}</table></body></html>`
}
