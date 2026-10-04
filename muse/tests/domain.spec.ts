import { describe, expect, it } from 'vitest'
import type { SessionEvent } from '@deepseek-ai/dsh-session'
import { latestAutonomy, MUSE_INTENT_VERSION, museIntentChange } from '../src/domain.ts'

function intentEvent(autonomy: boolean, seq: number, version = MUSE_INTENT_VERSION): SessionEvent {
  return {
    type: 'muse/intent',
    seq,
    time: 1,
    data: { ...museIntentChange(autonomy, seq), version },
  } as SessionEvent
}

function otherEvent(seq: number): SessionEvent {
  return { type: 'turn/start', seq, time: 1, data: { turn: seq } }
}

describe('latestAutonomy', () => {
  it('returns undefined for a log without intent events', () => {
    expect(latestAutonomy([otherEvent(0), otherEvent(1)])).toBeUndefined()
    expect(latestAutonomy([])).toBeUndefined()
  })

  it('returns the latest intent regardless of interleaving', () => {
    const events = [intentEvent(true, 0), otherEvent(1), intentEvent(false, 2), otherEvent(3)]
    expect(latestAutonomy(events)).toBe(false)
    expect(latestAutonomy(events.slice(0, 2))).toBe(true)
  })

  it('rejects an unsupported intent version', () => {
    expect(() => latestAutonomy([intentEvent(true, 0, 99)])).toThrow(/unsupported muse\/intent version/)
  })

  it('rejects a non-object intent record', () => {
    const event = { type: 'muse/intent', seq: 0, time: 1, data: null } as unknown as SessionEvent
    expect(() => latestAutonomy([event])).toThrow(new TypeError('muse/intent record must be an object'))
  })

  it('rejects a non-boolean autonomy value', () => {
    const event = {
      type: 'muse/intent',
      seq: 0,
      time: 1,
      data: { ...museIntentChange(true, 0), autonomy: 'yes' },
    } as unknown as SessionEvent
    expect(() => latestAutonomy([event])).toThrow(/autonomy must be a boolean/)
  })
})

describe('museIntentChange', () => {
  it('builds the complete v1 payload', () => {
    expect(museIntentChange(true, 5)).toEqual({
      kind: 'muse/intent',
      version: MUSE_INTENT_VERSION,
      autonomy: true,
      updatedAt: 5,
    })
  })
})
