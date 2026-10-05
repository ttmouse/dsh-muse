import { createElement, useState } from 'react'
import { summarizeMuseStatus } from './status-summary.ts'

type ClientElement = { readonly type: unknown; readonly props: unknown; readonly key: string | null }
type ToolContent = { type: 'text'; text: string } | { type: string; [key: string]: unknown }
type ToolCallBlock = { kind: 'tool-result'; content: readonly ToolContent[] } | { kind?: undefined }
type ToolCallViewProps = { block: ToolCallBlock }
type ClientContext = {
  slots: {
    inject(name: 'tool.call.toolview', register: () => unknown): unknown
    register(slot: { name: 'tool.call.toolview'; key: 'muse_status' }, component: (props: ToolCallViewProps) => ClientElement): unknown
  }
}

export const inject = ['slots']

export function apply(ctx: ClientContext): void {
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({
    name: 'tool.call.toolview',
    key: 'muse_status',
  }, MuseStatusRow))
}

function resultText(block: ToolCallBlock): string {
  if (!('kind' in block) || block.kind !== 'tool-result') return '正在读取当前会话状态…'
  return block.content.map(item => item.type === 'text' ? item.text : JSON.stringify(item, null, 2)).join('\n')
}

function MuseStatusRow({ block }: ToolCallViewProps): ClientElement {
  const [expanded, setExpanded] = useState(false)
  const output = resultText(block)
  const summary = summarizeMuseStatus(output)
  return createElement('section', {
    'aria-label': 'Muse 当前状态',
    style: { borderInlineStart: '3px solid var(--dsh-color-border-strong, #7c8da5)', padding: '4px 8px' },
  },
  createElement('button', {
    type: 'button',
    'aria-expanded': expanded,
    onClick: () => setExpanded(value => !value),
    style: {
      background: 'transparent', border: 0, color: 'inherit', cursor: 'pointer',
      display: 'block', font: 'inherit', lineHeight: 1.45, minHeight: 44,
      overflowWrap: 'anywhere', padding: '8px 4px', textAlign: 'start', width: '100%',
    },
  }, createElement('strong', null, summary)),
  expanded ? createElement('pre', {
    style: { font: 'inherit', margin: '4px 4px 8px', overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' },
  }, output) : null)
}
