/**
 * Muse memory: a human-editable, agent-writable memory file plus model-facing
 * `memory_save`, with the memory injected into every turn as a dynamic system
 * prompt context. @module @deepseek-ai/dsh-tool-memory
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'

export const name = 'tool-memory'
export const inject = ['systemPrompt', 'tools']

/** DSH home root; honors DSH_HOME like the rest of the runtime. */
export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

/** Canonical global memory file path (human-editable plain text). */
export function memoryFilePath(): string {
  return join(dshHome(), 'memories', 'main.md')
}

/** Per-project memory file (lessons/facts scoped to one working directory). */
export function projectMemoryFilePath(cwd = process.cwd()): string {
  const slug = cwd.replaceAll('/', '-').replace(/^-/, '') || 'root'
  return join(dshHome(), 'memories', 'projects', `${slug}.md`)
}

const HEADER = '# Muse memory\n\n> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.\n'

/** Collapse duplicate headers/blank runs left by concurrent writers; returns normalized text. */
export function normalizeMemory(text: string): string {
  const header = ['# Muse memory', '', '> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.', '']
  const seen = new Set<string>()
  const body: string[] = []
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (line.startsWith('# Muse memory') || (line.startsWith('>') && line.includes('Human-editable'))) continue
    if (line === '' && (body.at(-1) === '' || body.length === 0)) continue
    if (line !== '' && line !== '…(older memories trimmed)') {
      if (seen.has(line)) continue
      seen.add(line)
    }
    body.push(line)
  }
  while (body.at(-1) === '') body.pop()
  return [...header, ...body, ''].join('\n')
}

/** Read the current memory text (capped for prompt injection); '' when absent. Self-heals duplicated headers. */
export function readMemory(maxChars = 8000, path = memoryFilePath()): string {
  if (!existsSync(path)) return ''
  const raw = readFileSync(path, 'utf8')
  const text = normalizeMemory(raw)
  if (text !== raw) { try { writeFileSync(path, text, { mode: 0o600 }) } catch {} }
  return text.length > maxChars ? `…(older memories trimmed)\n${text.slice(-maxChars)}` : text
}

function appendEntry(content: string, kind: string, path = memoryFilePath()): void {
  if (!existsSync(path)) {
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, HEADER, { mode: 0o600 })
  }
  const line = `- [${new Date().toISOString()}] (${kind}) ${content.replaceAll('\n', ' ')}\n`
  writeFileSync(path, readFileSync(path, 'utf8') + line, { flag: 'a' })
}

function requireAgent(exec: ToolRunContext): NonNullable<ToolRunContext['agent']> {
  const agent = exec.agent
  if (agent === undefined || agent.status !== 'running') {
    throw new HarnessError('memory_save requires a running calling agent', 'MEMORY_TOOL_AGENT_REQUIRED')
  }
  return agent
}

const KINDS = ['preference', 'fact', 'lesson', 'persona'] as const
export type MemoryKind = (typeof KINDS)[number]

const SAVE_DESCRIPTION =
  'Persist a durable memory for future sessions (Muse-style). Use for: stable user preferences, '
  + 'long-lived facts about the user or their projects, and lessons learned worth retaining. '
  + 'Do NOT save transient task state. The memory is human-editable plain text and is injected '
  + 'into every future turn.'

/** Register the memory tool and the per-turn memory context. */
export function apply(ctx: Context): void {
  ctx.systemPrompt.context({
    name: 'muse:memory',
    order: 125,
    text: () => {
      const globalMemory = readMemory()
      const projectPath = projectMemoryFilePath()
      const projectMemory = readMemory(4000, projectPath)
      const parts: string[] = []
      if (globalMemory !== '') parts.push(globalMemory)
      if (projectMemory !== '') parts.push(`## Project memory (${process.cwd()})\n\n${projectMemory}`)
      if (parts.length === 0) return ''
      return `## User memory (human-editable, treat as durable context)\n\n${parts.join('\n')}`
    },
  })

  ctx.tools.register(defineTool({
    name: 'memory_save',
    description: SAVE_DESCRIPTION,
    parameters: {
      content: {
        type: 'string',
        required: true,
        description: 'The memory, one self-contained sentence (e.g. "用户偏好中文回复，代码注释用英文").',
      },
      kind: {
        type: 'string',
        required: true,
        description: `One of: ${KINDS.join(', ')}.`,
      },
      scope: {
        type: 'string',
        description: "'global' (default) injects into every session; 'project' injects only into sessions whose cwd matches this entry's working directory. Project-scope is right for lessons/facts tied to one codebase.",
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: { saved: { type: 'boolean', required: true } },
      },
      render: (_args: unknown, value: { saved: boolean }) => [{
        type: 'text' as const,
        text: JSON.stringify(value),
      }],
    },
    execute(args, exec) {
      requireAgent(exec)
      if (!(KINDS as readonly string[]).includes(args.kind)) {
        throw new HarnessError(`kind must be one of ${KINDS.join(', ')}`, 'MEMORY_TOOL_KIND_INVALID')
      }
      const path = args.scope === 'project' ? projectMemoryFilePath() : memoryFilePath()
      appendEntry(args.content.trim(), args.kind, path)
      return Promise.resolve({ saved: true })
    },
    presentCall: (args: { content: string; kind: string }) => ({
      card: 'generic' as const,
      title: `Remember (${args.kind})`,
      kind: 'other' as const,
    } satisfies GenericCallView),
  }))
}
