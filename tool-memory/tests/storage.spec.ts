import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { appendMemory, maintainMemory } from '../src/storage.ts'

let root: string
beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'muse-storage-')) })
afterEach(() => { rmSync(root, { recursive: true, force: true }) })

describe('timer memory storage', () => {
  it('archives stale facts while retaining enduring preferences/persona, then accepts another append', () => {
    const path = join(root, 'main.md'), archive = join(root, 'archive.md')
    const old = new Date('2020-01-01T00:00:00Z')
    appendMemory(path, 'durable preference', 'preference', old)
    appendMemory(path, 'durable persona', 'persona', old)
    appendMemory(path, 'stale fact', 'fact', old)
    appendMemory(path, 'fresh fact', 'fact')
    const result = maintainMemory(path, archive, 30)
    expect(result).toEqual({ archived: 1, kept: 3 })
    expect(readFileSync(path, 'utf8')).toContain('durable preference')
    expect(readFileSync(path, 'utf8')).not.toContain('stale fact')
    expect(readFileSync(archive, 'utf8')).toContain('stale fact')
    appendMemory(path, 'after maintenance', 'lesson')
    expect(readFileSync(path, 'utf8')).toContain('after maintenance')
  })

  it('dry-run changes no files, and rejects invalid retention', () => {
    const path = join(root, 'main.md'), archive = join(root, 'archive.md')
    appendMemory(path, 'old', 'fact', new Date('2020-01-01'))
    const before = readFileSync(path, 'utf8')
    expect(maintainMemory(path, archive, 30, true).archived).toBe(1)
    expect(readFileSync(path, 'utf8')).toBe(before)
    expect(existsSync(archive)).toBe(false)
    expect(() => maintainMemory(path, archive, NaN)).toThrow('positive')
  })

  it('refuses a competing writer without modifying memory', () => {
    const path = join(root, 'main.md')
    appendMemory(path, 'original', 'fact')
    const before = readFileSync(path, 'utf8')
    writeFileSync(`${path}.lock`, 'other writer')
    expect(() => appendMemory(path, 'competing', 'fact')).toThrow()
    expect(readFileSync(path, 'utf8')).toBe(before)
  })
})
