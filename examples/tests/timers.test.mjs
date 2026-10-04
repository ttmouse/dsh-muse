import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync, execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:http'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { reflectionText, validateReflection } from '../lib/reflection.mjs'
import { appendMemory } from '../../tool-memory/lib/storage.js'

const repo = fileURLToPath(new URL('../../', import.meta.url))
function scratch(operation) {
  const root = mkdtempSync(join(tmpdir(), 'muse-timer-cli-'))
  try { return operation(root) } finally { rmSync(root, { recursive: true, force: true }) }
}

test('local sensitive signals are filtered before judge or mailbox; normal signals queue once', () => scratch(root => {
  const signal = join(root, 'MUSE-SIGNAL.md')
  const run = flags => execFileSync(process.execPath, [join(repo, 'examples/gate/gate.mjs'), '--session', 'timer-test', ...flags], {
    cwd: '/', env: { ...process.env, DSH_HOME: root, MUSE_PROJECT_DIR: root }, encoding: 'utf8', timeout: 10000,
  })
  writeFileSync(signal, 'verification code 123456')
  assert.equal(run(['--judge']), '')
  assert.equal(existsSync(join(root, 'muse', 'notices')), false)
  writeFileSync(signal, 'A requested work unit completed; review the saved result')
  assert.match(run(['--dry-run']), /would inject/)
  assert.equal(existsSync(signal), true)
  assert.match(run([]), /queued/)
  const files = readdirSync(join(root, 'muse', 'notices'))
  assert.equal(files.length, 1)
  const notice = JSON.parse(readFileSync(join(root, 'muse', 'notices', files[0]), 'utf8'))
  assert.equal(notice.kind, 'notice')
  assert.equal(notice.sessionId, 'timer-test')
}))

test('maintenance CLI honors dry-run and keeps stable preferences', () => scratch(root => {
  const path = join(root, 'memories', 'main.md')
  appendMemory(path, 'stable preference', 'preference', new Date('2020-01-01'))
  appendMemory(path, 'old fact', 'fact', new Date('2020-01-01'))
  const before = readFileSync(path, 'utf8')
  const run = flags => execFileSync(process.execPath, [join(repo, 'examples/memory-maintenance.mjs'), ...flags], { env: { ...process.env, DSH_HOME: root }, encoding: 'utf8' })
  assert.match(run(['--days', '30', '--dry-run']), /dry-run.*archive 1/)
  assert.equal(readFileSync(path, 'utf8'), before)
  assert.match(run(['--days', '30']), /archive 1/)
  assert.match(readFileSync(path, 'utf8'), /stable preference/)
  assert.doesNotMatch(readFileSync(path, 'utf8'), /old fact/)
}))

test('reflection separates human/automatic inputs and rejects string booleans and secrets', () => {
  const records = [
    { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'Review my project' }], source: { kind: 'user' } } } },
    { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'A check completed' }], source: { kind: 'muse' } } } },
    { event: { type: 'user/message', data: { content: [{ type: 'text', text: 'verification code 123456' }], source: { kind: 'user' } } } },
  ]
  const text = reflectionText(records)
  assert.match(text, /human: Review/)
  assert.match(text, /automatic observation:/)
  assert.doesNotMatch(text, /123456/)
  const valid = { memory_additions: [], idea: { worth_saying: false, text: '' }, plan_note: '' }
  assert.equal(validateReflection(valid), valid)
  assert.throws(() => validateReflection({ ...valid, idea: { worth_saying: 'false', text: '' } }))
  assert.throws(() => validateReflection({ ...valid, memory_additions: [{ kind: 'preference', content: 'verification code 123456' }] }))
  assert.throws(() => validateReflection({ ...valid, persona_update: { worth: 'false', text: 'unsafe implicit update' } }))
  assert.throws(() => validateReflection({ ...valid, persona_update: { worth: true, text: 'password reset link' } }))
  const previous = process.env.MUSE_TEST_SECRET
  process.env.MUSE_TEST_SECRET = 'fixture-sensitive-value-123456'
  try {
    assert.throws(() => validateReflection({ ...valid, idea: { worth_saying: true, text: process.env.MUSE_TEST_SECRET } }))
    assert.doesNotMatch(reflectionText([{ type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: process.env.MUSE_TEST_SECRET }] } }]), /fixture-sensitive/)
  } finally {
    if (previous === undefined) Reflect.deleteProperty(process.env, 'MUSE_TEST_SECRET')
    else process.env.MUSE_TEST_SECRET = previous
  }
})

test('reflection reads the actual tail and project memory, deduplicates ideas, and skips unchanged inputs', async () => {
  const root = mkdtempSync(join(tmpdir(), 'muse-reflect-cli-'))
  mkdirSync(join(root, '.dsh'), { recursive: true })
  writeFileSync(join(root, '.dsh', '.credentials.yaml'), 'client-connection/browser-session:\n  secret: dGVzdC1rZXk=\n')
  let modelCalls = 0, tailRead = false
  const server = createServer(async (request, response) => {
    let body = ''
    for await (const part of request) body += part
    const input = JSON.parse(body)
    let out
    if (request.url === '/api/session/list') out = { result: { ok: true, value: { items: [{ sessionId: 'reflection-test', cwd: root, projections: { values: { goal: { objective: 'finish requested project', phase: 'active' } } } }] } } }
    else if (request.url === '/api/session/page') {
      const cursor = input.payload.args._request.throughSeq
      if (cursor > 20) out = { result: { ok: false, error: { message: 'past cursor 20' } } }
      else {
        tailRead = cursor === 20
        out = { result: { ok: true, value: { records: [{ event: { type: 'user/message', data: { source: { kind: 'user' }, content: [{ type: 'text', text: 'Please inspect the two existing project plans' }] } } }] } } }
      }
    } else {
      modelCalls++
      assert.match(input.messages[1].content, /finish requested project/)
      assert.match(input.messages[1].content, /projectMemory/)
      out = { choices: [{ message: { content: JSON.stringify({ memory_additions: [], idea: { worth_saying: true, text: 'You could ask me to compare the two plans against the goal' }, plan_note: 'Grounded in the current goal' }) } }] }
    }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(out))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}`
  try {
    const run = () => promisify(execFile)(process.execPath, [join(repo, 'examples/reflect/reflect.mjs'), '--session', 'reflection-test', '--url', url, '--project-dir', root], {
      env: { ...process.env, HOME: root, DSH_HOME: join(root, '.dsh'), DEEPSEEK_API_KEY: 'mock-only', MUSE_LLM_URL: url }, timeout: 10000,
    })
    assert.match((await run()).stdout, /proposal queued/)
    assert.equal(tailRead, true)
    assert.equal(modelCalls, 1)
    assert.match((await run()).stdout, /unchanged inputs/)
    assert.equal(modelCalls, 1)
    const notices = readdirSync(join(root, '.dsh', 'muse', 'notices')).filter(n => n.endsWith('.json'))
    assert.equal(notices.length, 1)
  } finally {
    await new Promise(resolve => server.close(resolve))
    rmSync(root, { recursive: true, force: true })
  }
})
