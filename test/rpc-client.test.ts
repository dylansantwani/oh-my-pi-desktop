import { describe, expect, it, afterEach } from 'vitest'
import { join } from 'path'
import { RpcClient } from '../src/main/rpc-client'
import type { RpcOutbound } from '../src/main/rpc-types'

const MOCK = join(__dirname, 'fixtures', 'mock-omp.mjs')
const clients: RpcClient[] = []

// Mock-only commands (slow / ping_echo / boom / never_answered) are not part of the
// real omp command set in RpcOutbound; the mock answers them anyway, so widen at the
// test boundary.
function mockCmd(cmd: object): RpcOutbound {
  return cmd as unknown as RpcOutbound
}

function makeClient(): RpcClient {
  const c = new RpcClient({ ompPath: MOCK, cwd: process.cwd(), scriptMode: true })
  clients.push(c)
  return c
}

afterEach(() => {
  for (const c of clients.splice(0)) c.stop()
})

describe('RpcClient', () => {
  it('starts, negotiates v2, and streams prompt events in order', async () => {
    const c = makeClient()
    await c.start()
    const seen: string[] = []
    c.on('event', (ev) => seen.push(ev.type as string))
    await c.send({ type: 'prompt', message: 'hi' })
    expect(seen).toEqual([
      'agent_start',
      'message_update',
      'message_update',
      'tool_execution_start',
      'tool_execution_end',
      'message_update',
      'agent_end'
    ])
  })

  it('correlates concurrent responses by id even when they arrive out of order', async () => {
    const c = makeClient()
    await c.start()
    const slow = c.send(mockCmd({ type: 'slow' }))
    const fast = c.send(mockCmd({ type: 'ping_echo', value: 42 }))
    expect(await fast).toEqual({ echo: 42 })
    expect(await slow).toEqual({ slow: true })
  })

  it('reassembles a v2 chunked response frame', async () => {
    const c = makeClient()
    await c.start()
    const data = await c.send({ type: 'set_model', provider: 'mock', modelId: 'mock-1' })
    expect(data).toEqual({ ok: true })
  })

  it('survives a malformed line and keeps processing', async () => {
    const c = makeClient()
    await c.start()
    const errors: string[] = []
    c.on('parse_error', ({ error }) => errors.push(error.message))
    await c.send(mockCmd({ type: 'boom' }))
    expect(errors.length).toBeGreaterThan(0)
    expect(await c.send(mockCmd({ type: 'ping_echo', value: 1 }))).toEqual({ echo: 1 })
  })

  it('rejects pending commands when the process exits', async () => {
    const c = makeClient()
    await c.start()
    const p = c.send(mockCmd({ type: 'never_answered' })).then(
      () => 'resolved',
      () => 'rejected'
    )
    c.stop()
    expect(await p).toBe('rejected')
  })
})
