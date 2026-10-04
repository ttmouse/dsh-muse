/** Shared DSH API client: signed-cookie auth, RPC calls, judge LLM. Local-only. */
import { createHash, createHmac, randomUUID } from 'node:crypto'
import { readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'
import { queueNotice } from '../../muse/lib/mailbox.js'

const b64u = b => Buffer.from(b).toString('base64').replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

/** Mint the browser-session cookie for an authority from the local credential record. */
export function mintCookie(authority) {
  const cred = readFileSync(join(process.env.HOME ?? homedir(), '.dsh', '.credentials.yaml'), 'utf8')
  const lines = cred.split('\n')
  const i = lines.findIndex(l => l.includes('client-connection/browser-session:'))
  const secretB64 = i === -1 ? undefined : lines.slice(i).find(l => l.trim().startsWith('secret:'))?.split('secret:')[1]?.trim()
  if (!secretB64) throw new Error('dsh-client: no browser-session credential record in ~/.dsh/.credentials.yaml')
  const secret = Buffer.from(secretB64, 'base64')
  const cookieName = 'dsh-auth-' + b64u(Buffer.from(createHash('sha256').update(authority).digest()))
  const now = Date.now()
  const body = b64u(Buffer.from(JSON.stringify({ version: 1, authority, issuedAt: now, expiresAt: now + 60 * 60 * 1000 }), 'utf8'))
  return `${cookieName}=v1.${body}.${b64u(createHmac('sha256', secret).update(body).digest())}`
}

/** Call one typert endpoint: callRpc(url, 'session/list', {...}) → result.value.
 *  Endpoints name their args field differently (`_request` vs `request`); on a
 *  descriptor mismatch we adopt whatever the gateway says is missing. */
export async function callRpc(url, endpoint, request, argsKey = '_request') {
  const address = new URL(url)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(address.hostname)) throw new Error('DSH RPC requires a loopback address')
  const authority = address.host
  const send = key => fetch(new URL(`/api/${endpoint}`, url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: mintCookie(authority) },
    signal: AbortSignal.timeout(15000),
    body: JSON.stringify({ type: 'client-request', rpcId: randomUUID(), method: endpoint, payload: { args: { [key]: request } } }),
  })
  let res = await send(argsKey)
  let out = await res.json()
  if (out?.result?.ok !== true) {
    const raw = out?.result?.error?.message ?? ''
    const missing = raw.match(/missing "([a-z_]+)"/)
    if (missing?.[1] && missing[1] !== argsKey && argsKey === '_request') return callRpc(url, endpoint, request, missing[1])
    throw new Error(`dsh-client: ${endpoint} failed: ${JSON.stringify(out?.result?.error ?? out).slice(0, 300)}`)
  }
  return out.result.value
}

/** Stage a notice; the native plugin delivers it with a non-human source. */
export async function injectPrompt(_url, sessionId, text, kind = 'notice') {
  return queueNotice(sessionId, text, kind)
}

/** DeepSeek-key resolution: env first, then the local credentials file. */
export function deepseekKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY
  const text = readFileSync(join(process.env.HOME ?? homedir(), '.dsh', '.credentials.yaml'), 'utf8')
  const line = text.split('\n').find(l => l.trim().startsWith('DEEPSEEK_API_KEY:'))
  return line?.split('DEEPSEEK_API_KEY:')[1]?.trim().replaceAll("'", '')
}

/** One cheap LLM call returning strict-JSON content. */
export async function llmJson(system, user, model = 'deepseek-chat') {
  const key = deepseekKey()
  if (!key) throw new Error('dsh-client: DEEPSEEK_API_KEY not found (env or credentials)')
  const base = process.env.MUSE_LLM_URL ?? 'https://api.deepseek.com'
  const res = await fetch(new URL('/chat/completions', base), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(45000),
    body: JSON.stringify({
      model, messages: [
        { role: 'system', content: `${system}\nReply ONLY strict JSON.` },
        { role: 'user', content: user },
      ],
      max_tokens: 1200, temperature: 0,
    }),
  })
  if (!res.ok) throw new Error(`dsh-client: llm failed ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const content = (await res.json()).choices?.[0]?.message?.content ?? ''
  const m = content.match(/\{[\s\S]*\}/)
  if (!m) throw new Error(`dsh-client: unparsable llm output: ${content.slice(0, 120)}`)
  return JSON.parse(m[0])
}

/** Append one audit line to a decisions log. */
export function logDecision(projectDir, label, line) {
  try { appendFileSync(join(projectDir, label), `- [${new Date().toISOString()}] ${line}\n`) } catch {}
}
