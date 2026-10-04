import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { Context } from '@deepseek-ai/cordis'
import { apply, appendEntry, memoryFilePath, normalizeMemory, projectMemoryFilePath, readMemory, supersedeEntries } from '../src/index.js'

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
  it('appends multiple entries once and deduplicates repeated saves', async () => {
    await tool().execute({ content: 'alpha', kind: 'preference' } as never, exec)
    await tool().execute({ content: 'beta', kind: 'lesson' } as never, exec)
    await tool().execute({ content: 'alpha', kind: 'preference' } as never, exec)
    const text = readFileSync(memoryFilePath(), 'utf8')
    expect(text.match(/# Muse memory/g)).toHaveLength(1)
    expect(text.match(/alpha/g)).toHaveLength(1)
    expect(text.match(/beta/g)).toHaveLength(1)
  })
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

  it('scope=project writes to the per-project file, not global', async () => {
    await tool().execute({ content: '本项目专属教训', kind: 'lesson', scope: 'project' } as never, exec)
    const p = projectMemoryFilePath()
    expect(existsSync(p)).toBe(true)
    expect(readFileSync(p, 'utf8')).toContain('本项目专属教训')
    if (existsSync(memoryFilePath())) expect(readFileSync(memoryFilePath(), 'utf8')).not.toContain('本项目专属教训')
  })

  it('prompt context includes global and current project sections', async () => {
    await tool().execute({ content: '全局偏好', kind: 'preference' } as never, exec)
    await tool().execute({ content: '项目内事实', kind: 'fact', scope: 'project' } as never, exec)
    const rendered = registered.contexts[0]!.text({})
    expect(rendered).toContain('全局偏好')
    expect(rendered).toContain('Project memory')
    expect(rendered).toContain('项目内事实')
  })

  it('supersedeEntries moves matching old entries to archive and keeps the correction', () => {
    appendEntry('用户的项目部署在 AWS', 'fact', memoryFilePath())
    appendEntry('用户的项目已迁移到自托管服务器', 'fact', memoryFilePath())
    const moved = supersedeEntries('AWS', memoryFilePath())
    expect(moved).toBe(1)
    const text = readFileSync(memoryFilePath(), 'utf8')
    expect(text).toContain('自托管服务器')
    expect(text).not.toContain('部署在 AWS')
  })

  it('normalizeMemory collapses duplicate headers and repeated entries (self-heal)', () => {
    const messy = [
      '# Muse memory', '', '> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.', '',
      '- [t1] (fact) alpha', '',
      '# Muse memory', '', '> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.', '',
      '- [t1] (fact) alpha', '- [t2] (lesson) beta', '', '',
    ].join('\n')
    const out = normalizeMemory(messy)
    expect(out.match(/# Muse memory/g)?.length).toBe(1)
    expect(out.match(/alpha/g)?.length).toBe(1)
    expect(out).toContain('beta')
  })
})
