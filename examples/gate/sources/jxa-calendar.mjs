/**
 * macOS Calendar source via JXA (osascript) — local event awareness with NO
 * cloud OAuth (pattern learned from Today.app's today-jxa-runner).
 *
 * Reads events starting within the next `hoursAhead` hours from Calendar.app
 * and returns normalized {summary, start, end, calendar} items for the gate.
 */
import { execFileSync } from 'node:child_process'

const JXA = `
const cal = Application('Calendar')
const now = new Date()
const end = new Date(now.getTime() + __HOURS__ * 3600 * 1000)
const out = []
for (const c of cal.calendars()) {
  let events = []
  try { events = c.events.whose({_and: [{startDate: {_greaterThan: now}}, {startDate: {_lessThan: end}}]})() } catch (e) { continue }
  for (const ev of events) {
    try {
      out.push(JSON.stringify({summary: ev.summary(), start: ev.startDate().toISOString(), end: ev.endDate().toISOString(), calendar: c.name()}))
    } catch (e) {}
  }
}
JSON.stringify(out)
`

/** Poll macOS Calendar for upcoming events. rule: { hoursAhead?, calendar?, excludeCalendars? } */
export function pollJxaCalendar(rule) {
  const script = JXA.replaceAll('__HOURS__', String(rule.hoursAhead ?? 24))
  let raw
  try {
    raw = execFileSync('osascript', ['-l', 'JavaScript', '-e', script], { timeout: 30000, encoding: 'utf8' })
  } catch (error) {
    const msg = String(error)
    if (msg.includes('not allowed') || msg.includes('permit') || msg.includes('-1743')) {
      const err = new Error('calendar-permission-required')
      err.code = 'CALENDAR_PERMISSION_REQUIRED'
      throw err
    }
    throw error
  }
  const parsed = JSON.parse(raw.trim().split('\n').at(-1)).map(s => typeof s === 'string' ? JSON.parse(s) : s)
  const exclude = new Set(rule.excludeCalendars ?? [])
  return parsed
    .filter(ev => !rule.calendar || ev.calendar === rule.calendar)
    .filter(ev => !exclude.has(ev.calendar))
    .map(ev => ({
      ...ev,
      id: `${ev.start}|${ev.summary}`,
      startLabel: new Date(ev.start).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' }),
    }))
}
