import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { RpcClient } from '../src/main/rpc-client'

const RUN = process.env.RUN_E2E === '1'

describe.skipIf(!RUN)('real omp integration', () => {
  it('streams a real prompt end to end', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'omp-e2e-'))
    const client = new RpcClient({ ompPath: 'omp', cwd, env: { PI_RPC_EMIT_TITLE: '1' } })
    await client.start()
    const types: string[] = []
    let text = ''
    client.on('event', (ev) => {
      types.push(ev.type as string)
      if (ev.type === 'message_update') {
        const ae = ev.assistantMessageEvent as { type?: string; delta?: string }
        if (ae.type === 'text_delta' && typeof ae.delta === 'string') text += ae.delta
      }
    })
    try {
      // omp 17.x replies to prompt with `{"type":"response","command":"prompt","success":true}`
      // and no data payload, so send() resolves undefined. The agent-invoked signal is
      // `agent_start` (rejects on failure, e.g. no provider configured).
      await client.send({ type: 'prompt', message: 'Reply with exactly the word: OK' })
      await new Promise<void>((resolve, reject) => {
        const check = (): void => {
          if (types.includes('agent_start')) resolve()
          else setTimeout(check, 200)
        }
        check()
        setTimeout(() => reject(new Error('no agent_start within 30s')), 30_000)
      })
      // Wait for agent_end
      await new Promise<void>((resolve, reject) => {
        const check = (): void => {
          if (types.includes('agent_end')) resolve()
          else setTimeout(check, 200)
        }
        check()
        setTimeout(() => reject(new Error('no agent_end within 120s')), 120_000)
      })
      expect(text).toContain('OK')
    } finally {
      client.stop()
    }
  }, 150_000)

  it('aborts a running turn', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'omp-e2e-'))
    const client = new RpcClient({ ompPath: 'omp', cwd, env: { PI_RPC_EMIT_TITLE: '1' } })
    await client.start()
    const types: string[] = []
    client.on('event', (ev) => types.push(ev.type as string))
    try {
      await client.send({ type: 'prompt', message: 'Write a very long essay about chips. Keep going until I stop you.' })
      // Wait for the agent to actually start so the abort hits a running turn
      await new Promise<void>((resolve, reject) => {
        const check = (): void => {
          if (types.includes('agent_start')) resolve()
          else setTimeout(check, 200)
        }
        check()
        setTimeout(() => reject(new Error('no agent_start within 30s')), 30_000)
      })
      await new Promise((r) => setTimeout(r, 2000))
      await client.send({ type: 'abort' })
      await new Promise((r) => setTimeout(r, 1500))
      // Process must still be alive and responsive
      const state = await client.send({ type: 'get_state' })
      expect(state).toBeTruthy()
    } finally {
      client.stop()
    }
  }, 150_000)
})
