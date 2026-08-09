import { describe, expect, it, afterAll, afterEach, beforeAll } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AgentHost, reconnectDelay } from '../src/main/agent-host'

const MOCK = join(__dirname, 'fixtures', 'mock-omp.mjs')
const hosts: AgentHost[] = []

// Two throwaway agents the shared fixture deliberately doesn't provide: one that
// reports the directory it was actually spawned in and then answers nothing, and
// one that dies immediately after the handshake. Written at run time so the
// fixture stays the single canned happy path.
const READY = `process.stdout.write(JSON.stringify({ type: 'ready', protocolVersion: 1, supportedProtocolVersions: [1] }) + '\\n')`
let scratch = ''
let REPORTER = ''
let CRASHER = ''

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'omp-host-'))
  REPORTER = join(scratch, 'reporter.mjs')
  writeFileSync(
    REPORTER,
    `${READY}\nprocess.stdout.write(JSON.stringify({ type: 'cwd_report', cwd: process.cwd() }) + '\\n')\nprocess.stdin.resume()\n`
  )
  CRASHER = join(scratch, 'crasher.mjs')
  writeFileSync(CRASHER, `${READY}\nsetTimeout(() => process.exit(1), 20)\n`)
})

afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** Real-timer poll: the conditions below are driven by actual OS processes. */
async function waitFor(cond: () => boolean, timeoutMs = 5000): Promise<void> {
  const start = Date.now()
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('condition never became true')
    await new Promise((r) => setTimeout(r, 10))
  }
}

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

  it('supersedes an in-flight connect to a different project', async () => {
    // realpath: macOS temp dirs are symlinks, and the child reports the resolved path.
    const a = realpathSync(mkdtempSync(join(tmpdir(), 'omp-a-')))
    const b = realpathSync(mkdtempSync(join(tmpdir(), 'omp-b-')))
    const h = new AgentHost({ ompPath: REPORTER, spawnAsNode: true })
    hosts.push(h)
    const reports: string[] = []
    h.onEvent((f) => {
      if (f.type === 'cwd_report') reports.push(f.cwd as string)
    })
    // Settle both outcomes up front — the superseded attempt is expected to reject.
    const first = h.connect(a).then(
      () => 'resolved',
      () => 'rejected'
    )
    await h.connect(b)
    await waitFor(() => reports.length > 0)
    expect(h.project).toBe(b)
    expect(h.status).toBe('connected')
    // The defect: connect(b) was coalesced into connect(a)'s promise and resolved
    // ok, so the renderer displayed and remembered b while the agent ran in a.
    expect(reports).toEqual([b])
    await expect(first).resolves.toBe('rejected')
    rmSync(a, { recursive: true, force: true })
    rmSync(b, { recursive: true, force: true })
  })

  it('keeps an error listener attached while a client is torn down', async () => {
    const h = new AgentHost({ ompPath: MOCK, spawnAsNode: true })
    hosts.push(h)
    await h.connect(process.cwd())
    const client = h.client!
    h.disconnect()
    // RpcClient re-emits 'error' from its child-process handlers during teardown;
    // with zero 'error' listeners Node throws and takes the whole app down.
    expect(() => client.emit('error', new Error('late stderr'))).not.toThrow()
  })

  it('backs off exponentially and caps the delay', () => {
    expect(reconnectDelay(1)).toBe(500)
    expect(reconnectDelay(2)).toBe(1000)
    expect(reconnectDelay(3)).toBe(2000)
    expect(reconnectDelay(7)).toBe(30_000)
    expect(reconnectDelay(50)).toBe(30_000)
  })

  it('gives up on a crash-looping agent instead of respawning forever', async () => {
    const logs: string[] = []
    const h = new AgentHost({
      ompPath: CRASHER,
      spawnAsNode: true,
      onLog: (m) => logs.push(m),
      reconnect: { baseMs: 5, maxMs: 20, maxAttempts: 2 }
    })
    hosts.push(h)
    await h.connect(process.cwd())
    await waitForStatus(h, 'offline')
    expect(logs.join('\n')).toMatch(/gave up after 2 reconnect attempts/)
  })

  it('rejects an RPC the agent never answers', async () => {
    const h = new AgentHost({ ompPath: REPORTER, spawnAsNode: true, requestTimeoutMs: 60, turnTimeoutMs: 60 })
    hosts.push(h)
    await h.connect(process.cwd())
    // Nothing else rejects these: RpcClient only fails pending requests on exit,
    // and this agent is hung-but-alive.
    await expect(h.prompt('hi')).rejects.toThrow(/did not respond to prompt within/i)
    await expect(h.getState()).rejects.toThrow(/did not respond to get_state within/i)
  })
})
