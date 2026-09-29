import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { generateObject, NoObjectGeneratedError } from 'ai'
import { buildImageExtractionRequest } from '../lib/import/image-extraction.ts'
import { buildFindingRowSchema } from '../lib/import/build-schema.ts'

const sidebar = { column_schema: [{ key: 'soil_ph', label: 'Soil pH', type: 'number', required: true }] }
const image = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII='
const row = {
  finding_date: '2026-09-28', sample_id: 'POT-A17', sample_type_label: '',
  measurement_type_label: '', measurement_group: '', values: { soil_ph: '6.40' },
  apparatus: '', notes: 'damp soil',
}

function mockProvider(response, inspect = () => {}) {
  return createOpenAICompatible({
    name: 'test', baseURL: 'https://example.invalid/v1',
    fetch: async (_url, init) => {
      inspect(JSON.parse(init.body))
      return Response.json({
        id: 'test-extraction', created: 1, model: 'vision-test',
        choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(response) }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
      })
    },
  })('vision-test')
}

test('JSON-only gateway receives the exact schema in the prompt and the image bytes', async () => {
  let inspected = false
  const result = await generateObject({
    model: mockProvider({ rows: [row] }, (body) => {
      inspected = true
      assert.deepEqual(body.response_format, { type: 'json_object' })
      const system = body.messages.find((message) => message.role === 'system').content
      const schema = JSON.parse(system.split('\n')[1])
      assert.deepEqual(schema.required, ['rows'])
      const fields = schema.properties.rows.items.properties
      assert.ok(fields.finding_date)
      assert.ok(fields.sample_type_label)
      assert.ok(fields.measurement_type_label)
      assert.equal(fields.values.additionalProperties.type, 'string')
      assert.match(fields.values.description, /"soil_ph" \(Soil pH, number\)/)
      const user = body.messages.find((message) => message.role === 'user')
      assert.equal(user.content.find((part) => part.type === 'image_url').image_url.url, `data:image/png;base64,${image}`)
    }),
    ...buildImageExtractionRequest(sidebar, image, 'image/png'),
    maxRetries: 0,
  })
  assert.equal(inspected, true)
  assert.deepEqual(result.object.rows, [row])
  assert.equal(buildFindingRowSchema(sidebar).safeParse(result.object.rows[0]).success, true)
  assert.equal(result.object.rows[0].values.soil_ph, '6.40')
})

test('a blank page can return zero rows without creating observations', async () => {
  const result = await generateObject({
    model: mockProvider({ rows: [] }),
    ...buildImageExtractionRequest(sidebar, image, 'image/png'),
    maxRetries: 0,
  })
  assert.deepEqual(result.object.rows, [])
})

test('incompatible model output is rejected instead of silently importing blank data', async () => {
  await assert.rejects(generateObject({
    model: mockProvider({ data: [{ date: '2026-09-28', measurement_values: { 'Soil pH': 6.4 } }] }),
    ...buildImageExtractionRequest(sidebar, image, 'image/png'),
    maxRetries: 0,
  }), (error) => NoObjectGeneratedError.isInstance(error))
})

test('a missing date remains blank and is rejected by import validation', () => {
  const { schema } = buildImageExtractionRequest(sidebar, image, 'image/png')
  const candidate = schema.parse({ rows: [{ sample_id: 'POT-A17', values: { soil_ph: '6.4' } }] }).rows[0]
  assert.equal(candidate.finding_date, '')
  assert.equal(buildFindingRowSchema(sidebar).safeParse(candidate).success, false)
})
