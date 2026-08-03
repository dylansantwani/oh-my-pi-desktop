import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'path'
import { AgentHost } from '../src/main/agent-host'

const MOCK = join(__dirname, 'fixtures', 'mock-omp.mjs')
const hosts: AgentHost[] = []

function waitForStatus(h: AgentHost, wanted: string, timeoutMs = 5000): Promise<void> {
  // Real-timer failsafe only: the wait is for an actual respawned OS process,
  // which fake timers cannot drive; the status event resolves normally.
  const { promise, resolve, reject } = Promise.withResolvers<void>()
  if (h.status === wanted) {
    resolve()
    return promise
  }
  const off = h.onStatus((s) => {
    if (s === wanted) {
      off()
      resolve()
    }
  })
  setTimeout(() => {
    off()
    reject(new Error(`status never became ${wanted} (last: ${h.status})`))
  }, timeoutMs)
  return promise
}

afterEach(() => {
  for (const h of hosts.splice(0)) h.disconnect()
})

describe('AgentHost', () => {
  it('connects, forwards events, and reports status transitions', async () => {
    const h = new AgentHost({ ompPath: MOCK, spawnAsNode: true })
    hosts.push(h)
    const statuses: string[] = []
    h.onStatus((s) => statuses.push(s))
    await h.connect(process.cwd())
    expect(h.status).toBe('connected')
    const events: string[] = []
    const off = h.onEvent((f) => events.push(f.type as string))
    await h.prompt('hi')
    off()
    expect(events).toContain('agent_start')
    expect(events).toContain('tool_execution_start')
    expect(events).toContain('agent_end')
    expect(statuses).toContain('connected')
  })

  it('auto-reconnects when the agent process exits', async () => {
    const h = new AgentHost({ ompPath: MOCK, spawnAsNode: true })
    hosts.push(h)
    const statuses: string[] = []
    const off = h.onStatus((s) => statuses.push(s))
    await h.connect(process.cwd())
    // Kill the agent process via a mock command; host must auto-reconnect.
    // sendRaw is used because 'die' is mock-only and must not pollute the
    // production RpcOutbound union (no response is expected or awaited).
    h.client!.sendRaw({ type: 'die' })
    // Wait on status transitions in order (reconnecting, then connected) so the
    // test can neither miss a transition nor race the respawned process.
    await waitForStatus(h, 'reconnecting')
    await waitForStatus(h, 'connected')
    off()
    expect(statuses).toContain('reconnecting')
    expect(statuses).toContain('connected')
  })
})
