/**
 * Muse memory: a human-editable, agent-writable memory file plus model-facing
 * `memory_save`, with the memory injected into every turn as a dynamic system
 * prompt context. @module @deepseek-ai/dsh-tool-memory
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { HarnessError } from '@deepseek-ai/dsh-llm'
import { defineTool } from '@deepseek-ai/dsh-tools'
import type { GenericCallView, ToolRunContext } from '@deepseek-ai/dsh-tools'
import { appendMemory, projectPath } from './storage.ts'

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
  return projectPath(dshHome(), cwd)
}

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
  // Reading a prompt must not rewrite a file another process may be appending.
  return text.length > maxChars ? `…(older memories trimmed)\n${text.slice(-maxChars)}` : text
}

/** Move memory lines containing `needle` into the archive file; returns archived count. */
export function supersedeEntries(needle: string, path = memoryFilePath()): number {
  if (!existsSync(path)) return 0
  const archivePath = join(dirname(path), 'archive', 'superseded.md')
  const lines = readFileSync(path, 'utf8').split('\n')
  const kept: string[] = [], moved: string[] = []
  for (const line of lines) {
    if (line.includes(needle) && line.trim().startsWith('- ')) moved.push(line)
    else kept.push(line)
  }
  if (moved.length === 0) return 0
  mkdirSync(dirname(archivePath), { recursive: true })
  const prev = existsSync(archivePath) ? readFileSync(archivePath, 'utf8') : '# Archive\n\n'
  writeFileSync(archivePath, prev + moved.join('\n').replace(/\n?$/, '\n') + '\n', { mode: 0o600 })
  writeFileSync(path, kept.join('\n'), { mode: 0o600 })
  return moved.length
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
    text: (context) => {
      const globalMemory = readMemory()
      const cwd = context.agent?.session.header.cwd ?? process.cwd()
      const projectPath = projectMemoryFilePath(cwd)
      const projectMemory = readMemory(4000, projectPath)
      const parts: string[] = []
      if (globalMemory !== '') parts.push(globalMemory)
      if (projectMemory !== '') parts.push(`## Project memory (${cwd})\n\n${projectMemory}`)
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
      supersedes: {
        type: 'string',
        description: '旧记忆的子串：本条纠正/取代该旧记忆，匹配的旧条目将移入归档（用于事实变更，如「已迁移到 X」取代「部署在 AWS」）。不确定就不要填。',
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
        properties: { saved: { type: 'boolean', required: true }, superseded: { type: 'integer' } },
      },
      render: (_args: unknown, value: { saved: boolean; superseded?: number }) => [{
        type: 'text' as const,
        text: JSON.stringify(value),
      }],
    },
    execute(args, exec) {
      const agent = requireAgent(exec)
      if (!(KINDS as readonly string[]).includes(args.kind)) {
        throw new HarnessError(`kind must be one of ${KINDS.join(', ')}`, 'MEMORY_TOOL_KIND_INVALID')
      }
      if (args.scope !== undefined && args.scope !== 'project' && args.scope !== 'global') {
        throw new HarnessError('scope must be global or project', 'MEMORY_TOOL_SCOPE_INVALID')
      }
      if (!args.content.trim()) throw new HarnessError('memory content must not be empty', 'MEMORY_TOOL_CONTENT_INVALID')
      const path = args.scope === 'project' ? projectMemoryFilePath(agent.session?.header.cwd) : memoryFilePath()
      appendMemory(path, args.content.trim(), args.kind)
      return Promise.resolve({ saved: true })
    },
    presentCall: (args: { content: string; kind: string }) => ({
      card: 'generic' as const,
      title: `Remember (${args.kind})`,
      kind: 'other' as const,
    } satisfies GenericCallView),
  }))
}
