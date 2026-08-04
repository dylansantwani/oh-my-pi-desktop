import { describe, expect, it } from 'vitest'
import { applyEvent, type TranscriptMessage } from '../src/renderer/src/lib/transcript'

const empty: TranscriptMessage[] = []

describe('applyEvent', () => {
  it('streams text deltas into a single assistant message', () => {
    let m = applyEvent(empty, { type: 'agent_start' })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hel' }, message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'lo' }, message: { role: 'assistant', content: [] } })
    expect(m).toHaveLength(1)
    expect(m[0]).toMatchObject({ role: 'assistant', text: 'Hello', complete: false })
    m = applyEvent(m, { type: 'agent_end', messages: [] })
    expect(m[0].complete).toBe(true)
  })

  it('tracks tool execution start/end as cards', () => {
    let m = applyEvent(empty, { type: 'tool_execution_start', toolCallId: 't1', name: 'read', args: { path: 'a' } })
    expect(m[0].toolCalls[0]).toMatchObject({ id: 't1', name: 'read', status: 'running' })
    m = applyEvent(m, { type: 'tool_execution_end', toolCallId: 't1', success: true, result: 'ok' })
    expect(m[0].toolCalls[0].status).toBe('ok')
    m = applyEvent(m, { type: 'tool_execution_end', toolCallId: 't2', success: false, error: 'boom' })
    expect(m[0].toolCalls[1]).toMatchObject({ id: 't2', status: 'error', error: 'boom' })
  })

  it('renders user messages appended by the app', () => {
    // sendPrompt appends a user message locally before calling the agent
    const withUser = [...empty, { id: 'u1', role: 'user' as const, text: 'hi', thinking: '', toolCalls: [], complete: true }]
    const m = applyEvent(withUser, { type: 'agent_start' })
    expect(m).toHaveLength(2)
  })

  it('never appends toolcall_delta JSON to visible text (real omp schema)', () => {
    let m = applyEvent(empty, { type: 'message_start', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'The user' }, message: { role: 'assistant', content: [] } })
    // toolcall deltas stream the tool-call JSON chunk by chunk
    for (const chunk of ['{"i": "', 'Creating note', '.txt"}']) {
      m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta', delta: chunk }, message: { role: 'assistant', content: [] } })
    }
    m = applyEvent(m, { type: 'message_end', message: { role: 'assistant', content: [] } })
    expect(m[0].text).toBe('')
    expect(m[0].thinking).toBe('The user')
    expect(m[0].complete).toBe(true)
  })

  it('ignores toolResult-role message frames entirely', () => {
    let m = applyEvent(empty, { type: 'message_start', message: { role: 'toolResult', toolCallId: 't1' } })
    expect(m).toHaveLength(0)
    m = applyEvent(m, { type: 'message_end', message: { role: 'toolResult', toolCallId: 't1' } })
    expect(m).toHaveLength(0)
  })

  it('attaches a tool card to the last assistant message even after message_end', () => {
    let m = applyEvent(empty, { type: 'message_start', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_end', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'tool_execution_start', toolCallId: 't9', name: 'write', args: { path: 'x' } })
    expect(m).toHaveLength(1)
    expect(m[0].toolCalls[0]).toMatchObject({ id: 't9', status: 'running' })
  })

  it('keeps a complete tool-using turn in one assistant message (thinking + card + reply)', () => {
    let m = applyEvent(empty, { type: 'message_start', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'think' }, message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'toolcall_delta', delta: '{}' }, message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_end', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'tool_execution_start', toolCallId: 't1', name: 'write', args: { path: 'x' } })
    m = applyEvent(m, { type: 'message_start', message: { role: 'toolResult', toolCallId: 't1' } })
    m = applyEvent(m, { type: 'message_end', message: { role: 'toolResult', toolCallId: 't1' } })
    m = applyEvent(m, { type: 'message_start', message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' }, message: { role: 'assistant', content: [] } })
    m = applyEvent(m, { type: 'message_end', message: { role: 'assistant', content: [] } })
    expect(m).toHaveLength(2)
    expect(m[0]).toMatchObject({ text: '', thinking: 'think', complete: true })
    expect(m[0].toolCalls).toHaveLength(1)
    expect(m[1]).toMatchObject({ text: 'Done', complete: true })
  })
})
