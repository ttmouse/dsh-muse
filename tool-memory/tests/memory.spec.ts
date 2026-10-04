import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { apply, memoryFilePath, readMemory } from '../src/index.js'

type Tool = { name: string; execute: (args: never, exec: unknown) => Promise<unknown>; description: string }
type PromptContext = { name: string; order: number; text: (ctx: { agent?: unknown }) => string }

const registered: { tools: Tool[]; contexts: PromptContext[] } = { tools: [], contexts: [] }
const ctx = {
  systemPrompt: { context: (c: PromptContext) => registered.contexts.push(c) },
  tools: { register: (tool: Tool) => registered.tools.push(tool) },
} as unknown as Context

const savedHome = process.env.DSH_HOME
let tmp = ''

const exec = { agent: { id: 'a1', status: 'running' } }

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'muse-mem-'))
  process.env.DSH_HOME = tmp
  registered.tools.length = 0
  registered.contexts.length = 0
  apply(ctx)
})

afterEach(() => {
  process.env.DSH_HOME = savedHome
  rmSync(tmp, { recursive: true, force: true })
})

function tool(): Tool {
  const t = registered.tools.find(t => t.name === 'memory_save')
  if (t === undefined) throw new Error('memory_save not registered')
  return t
}

describe('tool-memory', () => {
  it('registers memory_save and the muse:memory prompt context', () => {
    expect(registered.tools.map(t => t.name)).toEqual(['memory_save'])
    expect(registered.contexts[0]?.name).toBe('muse:memory')
    expect(registered.contexts[0]?.order).toBe(125)
  })

  it('appends a kind+timestamp entry and creates the file on first save', async () => {
    expect(existsSync(memoryFilePath())).toBe(false)
    await tool().execute({ content: '用户偏好中文回复', kind: 'preference' } as never, exec)
    const text = readFileSync(memoryFilePath(), 'utf8')
    expect(text).toContain('# Muse memory')
    expect(text).toMatch(/- \[\d{4}-\d{2}-\d{2}T.*] \(preference\) 用户偏好中文回复/)
  })

  it('flattens newlines and rejects unknown kinds', async () => {
    await tool().execute({ content: 'multi\nline\nfact', kind: 'fact' } as never, exec)
    expect(readFileSync(memoryFilePath(), 'utf8')).not.toMatch(/multi\nline/)
    await expect(tool().execute({ content: 'x', kind: 'secret' } as never, exec)).rejects.toThrow('kind must be one of')
    await tool().execute({ content: '回复保持简洁直接，不寒暄', kind: 'persona' } as never, exec)
    expect(readFileSync(memoryFilePath(), 'utf8')).toContain('(persona)')
  })

  it('rejects calls without a running agent', async () => {
    await expect(tool().execute({ content: 'x', kind: 'fact' } as never, { agent: undefined })).rejects.toThrow('running calling agent')
    await expect(tool().execute({ content: 'x', kind: 'fact' } as never, { agent: { id: 'a', status: 'idle' } })).rejects.toThrow('running calling agent')
  })

  it('prompt context renders memory and trims when over cap', async () => {
    await tool().execute({ content: 'remember this', kind: 'lesson' } as never, exec)
    const rendered = registered.contexts[0]!.text({})
    expect(rendered).toContain('remember this')
    expect(readMemory(20).length).toBeLessThanOrEqual(20 + '…(older memories trimmed)\n'.length)
  })

  it('empty memory renders as empty string', () => {
    expect(registered.contexts[0]!.text({})).toBe('')
  })
})
