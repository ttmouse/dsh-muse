/**
 * Offline verification for sources/imap.mjs — spins a fake IMAP server on a
 * local port and asserts LOGIN/SELECT/SEARCH/FETCH/STORE round-trips.
 * No real mailbox, no network beyond localhost.
 */
import { createServer } from 'node:net'
import { pollImap } from './sources/imap.mjs'

const SCRIPT = [
  '* OK IMAP4rev1 ready',
  'A1 OK LOGIN done',
  'A2 OK [READ-WRITE] SELECT done',
  '* SEARCH 23 24 25',
  'A3 OK SEARCH done',
  '* 23 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {60}',
  'From: boss@example.com',
  'Subject: 季度报告截止明天',
  'Date: Mon, 5 Oct 2026 09:00:00 +0800',
  '',
  ')',
  '* 24 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {48}',
  'From: newsletter@example.com',
  'Subject: 每周精选',
  'Date: Mon, 5 Oct 2026 08:00:00 +0800',
  '',
  ')',
  '* 25 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {50}',
  'From: hr@example.com',
  'Subject: 验证码相关勿回复',
  'Date: Mon, 5 Oct 2026 07:00:00 +0800',
  '',
  ')',
  'A4 OK FETCH done',
  'A5 OK STORE done',
]

const server = createServer(sock => {
  sock.write('* OK ready\r\n')
  let buf = ''
  const responses = [
    ['A1 OK LOGIN done'],
    ['A2 OK [READ-WRITE] SELECT done'],
    ['* SEARCH 23 24 25', 'A3 OK SEARCH done'],
    [
      '* 23 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {60}',
      'From: boss@example.com',
      'Subject: 季度报告截止明天',
      'Date: Mon, 5 Oct 2026 09:00:00 +0800',
      ')',
      '* 24 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {48}',
      'From: newsletter@example.com',
      'Subject: 每周精选',
      ')',
      '* 25 FETCH (BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {50}',
      'From: hr@example.com',
      'Subject: 验证码相关勿回复',
      ')',
      'A4 OK FETCH done',
    ],
    ['A5 OK STORE done'],
  ]
  let n = 0
  sock.on('data', d => {
    buf += d.toString('utf8')
    let i
    while ((i = buf.indexOf('\r\n')) >= 0) {
      buf = buf.slice(i + 2)
      n++
      const lines = responses[Math.min(n, responses.length) - 1] ?? ['A' + n + ' OK done']
      for (const l of lines) sock.write(l + '\r\n')
    }
  })
})

await new Promise(r => server.listen(0, '127.0.0.1', r))
const port = server.address().port

const msgs = await pollImap({
  host: '127.0.0.1', port, tls: false, user: 'u', password: 'p', mailbox: 'INBOX', limit: 10,
})

let failures = 0
const check = (label, cond) => { console.log(cond ? `  ✓ ${label}` : `  ✗ ${label}`); if (!cond) failures++ }
check('3 messages fetched', msgs.length === 3)
check('subject parsed (中文)', msgs.some(m => m.subject === '季度报告截止明天'))
check('from parsed', msgs.some(m => m.from === 'boss@example.com'))
check('ids ordered', msgs[0].from !== undefined)
console.log(failures === 0 ? 'imap dry-run: ALL PASS' : `imap dry-run: ${failures} FAILURES`)
server.close()
process.exit(failures === 0 ? 0 : 1)
