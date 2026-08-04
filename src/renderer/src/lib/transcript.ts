export interface ToolCallView {
  id: string
  name: string
  args: unknown
  status: 'running' | 'ok' | 'error'
  result?: unknown
  error?: string
}

export interface TranscriptMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  thinking: string
  toolCalls: ToolCallView[]
  complete: boolean
}

function lastAssistant(messages: TranscriptMessage[]): TranscriptMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role === 'assistant' && !m.complete) return m
  }
  return null
}

function newAssistant(ev: Record<string, unknown>, toolCalls: ToolCallView[] = []): TranscriptMessage {
  return { id: `a_${ev.timestamp ?? Date.now()}`, role: 'assistant', text: '', thinking: '', toolCalls, complete: false }
}

export function applyEvent(messages: TranscriptMessage[], ev: Record<string, unknown>): TranscriptMessage[] {
  const type = ev.type as string
  switch (type) {
    case 'agent_start':
    case 'turn_start':
    case 'message_start': {
      // message_start echoes user messages and tool results too — only open
      // an assistant message (tool results surface via the tool cards).
      const msg = ev.message as { role?: string } | undefined
      if (msg?.role === 'user' || msg?.role === 'toolResult') return messages
      const open = lastAssistant(messages)
      if (open) return messages
      return [...messages, newAssistant(ev)]
    }
    case 'message_update': {
      const msg = ev.message as { role?: string } | undefined
      if (msg?.role === 'user' || msg?.role === 'toolResult') return messages
      const ae = ev.assistantMessageEvent as Record<string, unknown> | undefined
      // Only text/thinking deltas carry visible content. toolcall_* deltas
      // stream tool-call JSON (real omp) — the tool cards render those instead.
      const evType = ae?.type
      if (evType !== 'text_delta' && evType !== 'thinking_delta') return messages
      const delta = typeof ae?.delta === 'string' ? ae.delta : ''
      if (!delta) return messages
      const open = lastAssistant(messages)
      if (!open) return messages
      const idx = messages.indexOf(open)
      const next = [...messages]
      // thinking_delta frames stream the model's reasoning; keep it out of text.
      if (evType === 'thinking_delta') {
        next[idx] = { ...open, thinking: open.thinking + delta }
      } else {
        next[idx] = { ...open, text: open.text + delta }
      }
      return next
    }
    case 'message_end':
    case 'agent_end': {
      // message_end fires for user echoes and tool results too — only complete
      // assistant turns.
      const msg = ev.message as { role?: string } | undefined
      if (msg?.role === 'user' || msg?.role === 'toolResult') return messages
      const open = lastAssistant(messages)
      if (!open) return messages
      const idx = messages.indexOf(open)
      const next = [...messages]
      next[idx] = { ...open, complete: true }
      return next
    }
    case 'tool_execution_start': {
      const card: ToolCallView = {
        id: String(ev.toolCallId ?? ev.id ?? `t_${Date.now()}`),
        name: String(ev.name ?? 'tool'),
        args: ev.args ?? {},
        status: 'running'
      }
      // Attach to the last assistant message even if already complete (real omp
      // completes the toolcall message before firing tool_execution_start), so
      // thinking + tool card stay in one block instead of a stray bubble.
      let idx = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          idx = i
          break
        }
      }
      if (idx === -1) return [...messages, newAssistant(ev, [card])]
      const next = [...messages]
      next[idx] = { ...next[idx], toolCalls: [...next[idx].toolCalls, card] }
      return next
    }
    case 'tool_execution_update': {
      const id = String(ev.toolCallId ?? ev.id ?? '')
      if (!id) return messages
      return updateTool(messages, id, (t) => ({ ...t, args: ev.args ?? t.args, result: ev.result ?? t.result }))
    }
    case 'tool_execution_end': {
      const id = String(ev.toolCallId ?? ev.id ?? '')
      if (!id) return messages
      const success = ev.success !== false
      const err = typeof ev.error === 'string' ? ev.error : undefined
      const found = messages.some((m) => m.toolCalls.some((t) => t.id === id))
      if (!found) {
        // End event for a card we never saw start: surface it as an error card.
        const card: ToolCallView = {
          id,
          name: String(ev.name ?? 'tool'),
          args: ev.args ?? {},
          status: 'error',
          error: err ?? String(ev.error ?? 'tool failed')
        }
        const open = lastAssistant(messages)
        if (!open) return [...messages, newAssistant(ev, [card])]
        const idx = messages.indexOf(open)
        const next = [...messages]
        next[idx] = { ...open, toolCalls: [...open.toolCalls, card] }
        return next
      }
      return updateTool(messages, id, (t) => ({
        ...t,
        status: success ? 'ok' : 'error',
        result: ev.result ?? t.result,
        error: err ?? (success ? undefined : String(ev.error ?? 'tool failed'))
      }))
    }
    default:
      return messages
  }
}

function updateTool(messages: TranscriptMessage[], id: string, fn: (t: ToolCallView) => ToolCallView): TranscriptMessage[] {
  const next = messages.map((m) => {
    if (m.toolCalls.length === 0) return m
    let changed = false
    const toolCalls = m.toolCalls.map((t) => {
      if (t.id !== id) return t
      changed = true
      return fn(t)
    })
    return changed ? { ...m, toolCalls } : m
  })
  return next
}

export function pushUserMessage(messages: TranscriptMessage[], text: string): TranscriptMessage[] {
  return [...messages, { id: `u_${Date.now()}`, role: 'user', text, thinking: '', toolCalls: [], complete: true }]
}
