import { describe, expect, it } from 'vitest'
import { historyToTranscript } from '../src/renderer/src/lib/history'

describe('historyToTranscript', () => {
  it('converts user and assistant messages with tool_use blocks', () => {
    const raw = [
      { role: 'user', content: [{ type: 'text', text: 'hi' }] },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'hmm' },
          { type: 'text', text: 'Let me check' },
          { type: 'tool_use', id: 'tu1', name: 'read', input: { path: 'x' } }
        ]
      }
    ]
    const out = historyToTranscript(raw)
    expect(out).toHaveLength(2)
    expect(out[0]).toMatchObject({ role: 'user', text: 'hi' })
    expect(out[1]).toMatchObject({ text: 'Let me check', thinking: 'hmm' })
    expect(out[1].toolCalls[0]).toMatchObject({ id: 'tu1', name: 'read', status: 'ok' })
  })
})
