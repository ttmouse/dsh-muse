import { isCredentialExfiltration } from './outbound-policy.mjs'
/** Pure reflection input/output boundary, shared by timer tests. */
const sensitive = /验证码|verification code|one[- ]time code|password reset|重置密码|magic link|免密登录|reset your password|sign[- ]in link/i

export function reflectionText(records, limit = 24) {
  const lines = []
  let proposalTurn = false
  for (const record of records) {
    const event = record.event ?? record
    if (!['user/message', 'assistant/message', 'agent/message'].includes(event.type)) continue
    if (event.type === 'user/message') {
      proposalTurn = event.data?.source?.kind === 'muse' && event.data.source.trigger === 'idea'
    }
    // Our own proposals and their presentation are not fresh evidence to reflect on.
    if (proposalTurn) continue
    const text = (event.data?.content ?? []).filter(c => c.type === 'text').map(c => c.text ?? '').join(' ')
    if (!text || sensitive.test(text) || isCredentialExfiltration(text) || /^(<system-reminder>|Time sampled|\[muse-idea\])/.test(text)) continue
    const actor = event.type === 'user/message' ? (event.data.source?.kind === 'user' ? 'human' : 'automatic observation') : 'assistant'
    lines.push(`${actor}: ${text.slice(0, 2000)}`)
  }
  return lines.slice(-limit).join('\n')
}

export function validateReflection(value) {
  if (!value || !Array.isArray(value.memory_additions) || value.memory_additions.length > 8
    || typeof value.idea?.worth_saying !== 'boolean' || typeof value.idea?.text !== 'string'
    || typeof value.plan_note !== 'string') throw new Error('Invalid structured reflection output')
  for (const addition of value.memory_additions) {
    if (!['preference', 'fact', 'lesson'].includes(addition?.kind) || typeof addition.content !== 'string'
      || !addition.content.trim() || addition.content.length > 2000 || sensitive.test(addition.content)) throw new Error('Invalid memory addition')
  }
  if (value.persona_update !== undefined && (typeof value.persona_update.worth !== 'boolean'
    || typeof value.persona_update.text !== 'string' || value.persona_update.text.length > 2000
    || sensitive.test(value.persona_update.text))) throw new Error('Invalid persona update')
  if (isCredentialExfiltration(value) || sensitive.test(value.plan_note) || sensitive.test(value.idea.text)) throw new Error('Sensitive content in proposal')
  return value
}
