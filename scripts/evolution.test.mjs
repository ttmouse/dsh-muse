import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { validateState, renderReport, localFile } from './evolution.mjs'

const fixture = () => ({
  version: 1, updated: '2026-10-05', stage: 'S0', runtime_note: 'Test fixture, no authority', next: 'B01',
  candidates: ['B00', 'B01', 'B02'].map((id, i) => ({
    id, title: 'Bounded experiment', status: i === 0 ? 'accepted' : 'ready',
    problem: 'Observed friction', hypothesis: 'Testable change', scenario: 'E1',
    next_action: 'Collect evidence', evidence: i === 0 ? ['R00'] : [],
  })),
  rounds: [{ id: 'R00', candidate: 'B00', decision: 'accepted', level: 'engineering',
    evidence: ['docs/evolution/rounds/2026-10-05-bootstrap.md'], summary: 'Fixture outcome' }],
})

test('repository state has local evidence and one continuation', () => {
  const state = JSON.parse(readFileSync(new URL('../docs/evolution/state.json', import.meta.url), 'utf8'))
  assert.deepEqual(validateState(state), [])
})

test('completed work cannot lose evidence or reference another candidate outcome', () => {
  const state = fixture()
  state.candidates[0].evidence = []
  assert.ok(validateState(state).some(x => x.includes('terminal decision needs evidence')))
  state.candidates[0].evidence = ['R00']
  state.rounds[0].candidate = 'B01'
  assert.ok(validateState(state).some(x => x.includes('invalid round reference')))
})

test('missing evidence files and contradictory outcome are rejected', () => {
  assert.ok(validateState(fixture(), () => false).some(x => x.includes('missing or unsafe evidence')))
  const state = fixture()
  state.rounds[0].decision = 'rejected'
  assert.ok(validateState(state).some(x => x.includes('status must match')))
})

test('parallel active work and invalid next step fail checks', () => {
  const state = fixture()
  state.candidates[1].status = 'active'
  state.candidates[2].status = 'active'
  state.next = 'B00'
  const errors = validateState(state)
  assert.ok(errors.some(x => x.includes('at most one active')))
  assert.ok(errors.some(x => x.includes('next must reference')))
})

test('malformed input does not silently pass', () => {
  for (const value of [null, [], {}, { candidates: [], rounds: [] }]) assert.ok(validateState(value).length)
  const state = fixture()
  state.candidates[0].evidence = 'not-an-array'
  assert.ok(validateState(state).length)
  state.rounds[0].evidence = ['../../outside.md']
  assert.ok(validateState(state, () => true).some(x => x.includes('unsafe evidence')))
  assert.equal(localFile('../outside.md'), false)
  assert.equal(localFile('/etc/hosts'), false)
})

test('untrusted research text cannot execute as report HTML', () => {
  const state = fixture()
  state.candidates[1].title = '<script>alert("x")</script>'
  state.runtime_note = '<img src=x onerror=alert(1)>'
  const html = renderReport(state)
  assert.ok(!html.includes(state.candidates[1].title))
  assert.ok(!html.includes(state.runtime_note))
  assert.ok(html.includes('&lt;script&gt;'))
  assert.ok(!/https?:\/\//.test(html))
})
