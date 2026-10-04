/** Shared, model-independent memory storage for tools and timer workers. */
import { openSync, closeSync, unlinkSync, mkdirSync, readFileSync, writeFileSync, renameSync, appendFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'

export const MEMORY_HEADER = '# Muse memory\n\n> Human-editable. One `- [timestamp] (kind) content` line per memory. The agent appends via memory_save and reads this file every turn.\n\n'

export function projectRoot(cwd: string): string {
  try { return execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() }
  catch { return cwd }
}

export function projectPath(home: string, cwd: string): string {
  const slug = projectRoot(cwd).replaceAll('/', '-').replace(/^-/, '') || 'root'
  return join(home, 'memories', 'projects', `${slug}.md`)
}

/** Refuse contention rather than risk lost writes; callers can retry next tick. */
export function withMemoryLock<T>(path: string, operation: () => T): T {
  mkdirSync(dirname(path), { recursive: true })
  const lock = `${path}.lock`
  let descriptor: number
  try { descriptor = openSync(lock, 'wx', 0o600) }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    const prior = readFileSync(lock, 'utf8')
    const owner = Number(prior)
    if (!Number.isSafeInteger(owner) || owner <= 0) throw error
    try { process.kill(owner, 0); throw error }
    catch (probe) {
      if ((probe as NodeJS.ErrnoException).code !== 'ESRCH') throw error
      if (readFileSync(lock, 'utf8') !== prior) throw error
      unlinkSync(lock)
      descriptor = openSync(lock, 'wx', 0o600)
    }
  }
  writeFileSync(descriptor, String(process.pid))
  try { return operation() }
  finally { closeSync(descriptor); unlinkSync(lock) }
}

export function atomicText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true })
  const temporary = `${path}.${randomUUID()}.tmp`
  writeFileSync(temporary, text, { mode: 0o600, flag: 'wx' })
  renameSync(temporary, path)
}

export function appendMemory(path: string, content: string, kind: string, now = new Date()): boolean {
  const sentence = content.trim().replaceAll('\n', ' ')
  if (!sentence) throw new Error('Memory content must not be empty')
  return withMemoryLock(path, () => {
    if (!existsSync(path)) writeFileSync(path, MEMORY_HEADER, { mode: 0o600, flag: 'wx' })
    const text = readFileSync(path, 'utf8')
    if (text.split('\n').some(line => line.replace(/^- \[[^\]]+\] /, '') === `(${kind}) ${sentence}`)) return false
    appendFileSync(path, `${text.endsWith('\n') ? '' : '\n'}- [${now.toISOString()}] (${kind}) ${sentence}\n`, { mode: 0o600 })
    return true
  })
}

/** Age is only a retention policy for facts/lessons, never for enduring preferences. */
export function maintainMemory(path: string, archivePath: string, days: number, dryRun = false, now = Date.now()): { archived: number; kept: number } {
  if (!Number.isFinite(days) || days <= 0) throw new Error('days must be a positive number')
  if (!existsSync(path)) return { archived: 0, kept: 0 }
  const plan = () => {
    const cutoff = now - days * 86_400_000
    const keep: string[] = []
    const archive: string[] = []
    const seen = new Set<string>()
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      if (line.startsWith('# Muse memory') || line.startsWith('> Human-editable') || !line.trim()) continue
      const entry = line.match(/^- \[([^\]]+)\] \(([^)]+)\) (.*)$/)
      const key = entry ? `${entry[2]}:${entry[3]}` : line
      if (seen.has(key)) continue
      seen.add(key)
      const stamp = entry ? Date.parse(entry[1]!) : NaN
      if (entry && ['fact', 'lesson'].includes(entry[2]!) && Number.isFinite(stamp) && stamp < cutoff) archive.push(line)
      else keep.push(line)
    }
    if (!dryRun) {
      // Archive first: a crash may duplicate history, but cannot erase it.
      if (archive.length) {
        withMemoryLock(archivePath, () => {
          const prior = existsSync(archivePath) ? readFileSync(archivePath, 'utf8') : '# Muse memory archive\n\n'
          const unique = archive.filter(line => !prior.includes(line))
          atomicText(archivePath, prior + (prior.endsWith('\n') ? '' : '\n') + unique.join('\n') + '\n')
        })
      }
      atomicText(path, MEMORY_HEADER + keep.join('\n') + '\n')
    }
    return { archived: archive.length, kept: keep.length }
  }
  return dryRun ? plan() : withMemoryLock(path, plan)
}
