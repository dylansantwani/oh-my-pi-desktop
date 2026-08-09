import type { TranscriptMessage, ToolCallView } from './transcript'

interface RawBlock {
  type?: string
  text?: string
  thinking?: string
  id?: string
  name?: string
  input?: unknown
  toolUseId?: string
  content?: unknown
  isError?: boolean
}

function toToolCall(b: RawBlock): ToolCallView | null {
  if (b.type !== 'tool_use') return null
  return { id: b.id ?? `h_${Math.random().toString(36).slice(2)}`, name: b.name ?? 'tool', args: b.input ?? {}, status: 'ok' }
}

// Ids used to restart at h_0 for every page. Pages are *prepended* as the user
// scrolls back, so a second page collided with the first: React reused DOM
// nodes across unrelated messages and a search hit highlighted two rows at
// once. A monotonic counter keeps them unique for the life of the window.
let seq = 0

export function historyToTranscript(raw: unknown[]): TranscriptMessage[] {
  const out: TranscriptMessage[] = []
  for (const m of raw as Array<{ role?: string; content?: unknown; text?: string }>) {
    if (m.role === 'user') {
      const text = typeof m.text === 'string' ? m.text : extractText(m.content)
      out.push({ id: `h_${seq++}`, role: 'user', text, thinking: '', toolCalls: [], complete: true })
      continue
    }
    if (m.role === 'assistant') {
      const blocks = Array.isArray(m.content) ? (m.content as RawBlock[]) : []
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
      const thinking = blocks.filter((b) => b.type === 'thinking').map((b) => b.thinking ?? '').join('')
      const toolCalls = blocks.map(toToolCall).filter((t): t is ToolCallView => t !== null)
      out.push({ id: `h_${seq++}`, role: 'assistant', text, thinking, toolCalls, complete: true })
    }
  }
  return out
}

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return (content as RawBlock[])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('')
  }
  return ''
}
