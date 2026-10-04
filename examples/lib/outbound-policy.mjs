/**
 * muse outbound-policy (F3 v0) — the single outbound decision surface.
 *
 * Muse/Sentinel principle: the agent may REQUEST outbound actions; this module
 * decides. Local-only, deterministic, no LLM.
 *
 * Decisions: 'allow' | 'deny' | 'require-approval'
 *
 * v0 rules (precedence: deny > require-approval > allow):
 *  1. CREDENTIAL_EXFILTRATION (deny, never overridable): payload contains any
 *     fragment of secret material from the local credential store or env keys.
 *  2. SENSITIVE_CONTENT (deny for proactive surfaces): OTP/password-reset/
 *     magic-link content must never be relayed outward.
 *  3. EMAIL_SEND (require-approval): unless the caller proves an approval flow
 *     exists (sendApproval gate upstream).
 *  4. default allow for same-session injection (not truly "outbound").
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

const SENSITIVE_PATTERNS = [
  /验证码|verification code|one[- ]time code/i,
  /password reset|重置密码|reset your password/i,
  /sign[- ]in link|magic link|免密登录/i,
]

/** Collect secret fragments known locally (never logged, never returned). */
export function collectSecretFragments() {
  const fragments = []
  const credPath = join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), '.credentials.yaml')
  try {
    if (existsSync(credPath)) {
      for (const line of readFileSync(credPath, 'utf8').split('\n')) {
        const m = line.match(/_API_KEY:\s*'?([^\s']{12,})'?/) ?? line.match(/secret:\s*'?([^\s']{12,})'?/)
        if (m) fragments.push(m[1])
      }
    }
  } catch {}
  for (const [k, v] of Object.entries(process.env)) {
    if (/(_API_KEY|_TOKEN|_SECRET)$/.test(k) && typeof v === 'string' && v.length >= 12) fragments.push(v)
  }
  // partial-prefix detection: first 16 chars of each secret are also identifying
  return fragments.flatMap(f => [f, f.slice(0, 16)])
}

/** True when payload would leak credential material. */
export function isCredentialExfiltration(payload) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return collectSecretFragments().some(f => text.includes(f))
}

const isSensitive = text => SENSITIVE_PATTERNS.some(p => p.test(text))

/**
 * Decide an outbound action.
 * @param {object} o - { channel: 'session-inject'|'email-send'|'external-api'|'message-send', payload, approved? }
 * @returns {{decision: 'allow'|'deny'|'require-approval', rule: string}}
 */
export function checkOutbound({ channel, payload, approved = false }) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '')

  if (isCredentialExfiltration(text)) return { decision: 'deny', rule: 'F3.1 凭证外泄防护：出站内容包含本机凭证材料，无条件拒绝（不可覆盖）' }
  if (channel !== 'session-inject' && isSensitive(text)) return { decision: 'deny', rule: 'F3.2 敏感内容不外发：验证码/密码重置类内容仅本地处理' }
  if (channel === 'email-send' && !approved) return { decision: 'require-approval', rule: 'F3.3 发信需人类审批（Muse/Sentinel 同源默认）' }
  if (channel === 'message-send' && !approved) return { decision: 'require-approval', rule: 'F3.3 向外部会话/群发送消息需人类审批' }
  return { decision: 'allow', rule: 'default' }
}
