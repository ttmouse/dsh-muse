/**
 * Minimal IMAP client for gate polling: LOGIN → SELECT → SEARCH UNSEEN →
 * FETCH (FROM / SUBJECT / date) → optionally STORE \Seen. Speaks just enough
 * IMAP4rev1 over TLS (or plain TCP for tests). No dependencies.
 */
import { connect as tlsConnect } from 'node:tls'
import { connect as netConnect } from 'node:net'

/** Run one IMAP command sequence against a socket; resolves tagged responses. */
class ImapLite {
  constructor(socket) { this.socket = socket; this.tag = 0; this.buffer = ''; this.waiters = [] }
  static connect({ host, port, tls = true }) {
    return new Promise((resolve, reject) => {
      const socket = tls ? tlsConnect({ host, port, rejectUnauthorized: false }) : netConnect({ host, port })
      socket.once('error', reject)
      socket.once(tls ? 'secureConnect' : 'connect', () => resolve(new ImapLite(socket)))
    })
  }
  /** Read until a line starting with `tag` arrives; returns all accumulated lines. */
  readUntil(tag) {
    return new Promise((resolve, reject) => {
      const done = () => {
        const lines = this.buffer.split('\r\n').filter(Boolean)
        this.buffer = ''
        resolve(lines)
      }
      this.waiters.push({ tag, done, reject })
      this.socket.on('data', chunk => { this.buffer += chunk.toString('utf8'); this.pump() })
      this.socket.once('error', reject)
      this.pump()
    })
  }
  pump() {
    for (const w of [...this.waiters]) {
      if (this.buffer.includes(`\r\n${w.tag} `) || this.buffer.startsWith(`${w.tag} `)) {
        this.waiters = this.waiters.filter(x => x !== w)
        w.done()
      }
    }
  }
  async command(text) {
    const tag = `A${++this.tag}`
    this.socket.write(`${tag} ${text}\r\n`)
    return this.readUntil(tag)
  }
  async login(user, password) {
    const lines = await this.command(`LOGIN "${user.replaceAll('"', '')}" "${password.replaceAll('"', '')}"`)
    if (lines.some(l => l.startsWith(`A${this.tag} BAD`) || l.startsWith(`A${this.tag} NO`))) {
      throw new Error(`imap: login rejected: ${lines.at(-1)?.slice(0, 120)}`)
    }
  }
  async selectUnseen(mailbox = 'INBOX') {
    await this.command(`SELECT "${mailbox}"`)
    const lines = await this.command('SEARCH UNSEEN')
    const line = lines.find(l => l.includes(' SEARCH')) ?? ''
    return line.replace(/^[^]*\* SEARCH */, '').trim().split(/\s+/).filter(Boolean)
  }
  async fetchHeaders(ids) {
    if (ids.length === 0) return []
    const lines = await this.command(`FETCH ${ids.join(',')} (BODY[HEADER.FIELDS (FROM SUBJECT DATE)])`)
    const out = []
    let current = {}
    for (const line of lines) {
      if (/^A\d+ /.test(line) || line.startsWith('* ')) {
        if (current.from || current.subject) out.push(current)
        current = {}
      }
      const m = line.match(/^(From|Subject|Date):\s*(.+)$/i)
      if (m) current[m[1].toLowerCase()] = m[2].trim()
    }
    if (current.from || current.subject) out.push(current)
    return out.map(h => ({ from: h.from ?? '(unknown)', subject: h.subject ?? '(no subject)', date: h.date ?? '' }))
  }
  async markSeen(ids) { if (ids.length > 0) await this.command(`STORE ${ids.join(',')} +FLAGS (\\Seen)`) }
  logout() { try { this.socket.write('A999 LOGOUT\r\n'); this.socket.end() } catch {} }
}

/**
 * Poll an IMAP mailbox for unseen messages.
 * @param {object} rule - { host, port?, user, password, mailbox?, markSeen?, limit? }
 * @returns {Promise<{id: string, from: string, subject: string, date: string}[]>}
 */
export async function pollImap(rule) {
  const imap = await ImapLite.connect({ host: rule.host, port: rule.port ?? 993, tls: rule.tls ?? true })
  try {
    await imap.login(rule.user, rule.password)
    const ids = await imap.selectUnseen(rule.mailbox ?? 'INBOX')
    const messages = await imap.fetchHeaders(ids.slice(0, rule.limit ?? 10))
    if (rule.markSeen) await imap.markSeen(ids.slice(0, rule.limit ?? 10))
    return messages.map(m => ({ id: `${m.date}|${m.subject}|${m.from}`, ...m }))
  } finally { imap.logout() }
}
