#!/usr/bin/env node
// Mock omp RPC server for deterministic tests.
// Reads JSONL commands on stdin, emits canned frames on stdout.
import readline from 'node:readline'

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity })

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n')
}

// 1. ready frame (v1, advertises v2)
emit({
  type: 'ready',
  protocolVersion: 1,
  supportedProtocolVersions: [1, 2],
  maxFrameBytes: 1048576,
  maxReassembledFrameBytes: 67108864
})

let msgSeq = 0

function respond(id, command, data) {
  emit({ id, type: 'response', command, success: true, data })
}

rl.on('line', (line) => {
  let cmd
  try {
    cmd = JSON.parse(line)
  } catch {
    emit({ id: undefined, type: 'response', command: 'parse', success: false, error: 'bad json' })
    return
  }
  switch (cmd.type) {
    case 'negotiate_protocol':
      respond(cmd.id, 'negotiate_protocol', { protocolVersion: 2 })
      break
    case 'prompt': {
      emit({ type: 'agent_start' })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Hello' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' world' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'tool_execution_start', toolCallId: 'toolu_1', name: 'read', args: { path: 'a.txt' } })
      emit({ type: 'tool_execution_end', toolCallId: 'toolu_1', success: true, result: 'a.txt: hi' })
      emit({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: ' done.' }, message: { role: 'assistant', content: [] } })
      emit({ type: 'agent_end', messages: [] })
      respond(cmd.id, 'prompt', { agentInvoked: true })
      break
    }
    case 'abort':
      respond(cmd.id, 'abort', {})
      break
    case 'get_state':
      respond(cmd.id, 'get_state', { model: { provider: 'mock', id: 'mock-1' }, isStreaming: false, messageCount: msgSeq })
      break
    case 'set_model': {
      msgSeq++
      const payload = { id: cmd.id, type: 'response', command: 'set_model', success: true, data: { ok: true } }
      const json = JSON.stringify(payload)
      const b64 = Buffer.from(json, 'utf8').toString('base64')
      const bytes = Buffer.byteLength(b64, 'utf8')
      const count = Math.ceil(bytes / 8) // tiny segments force multi-chunk reassembly
      for (let i = 0; i < count; i++) {
        emit({
          type: 'rpc_chunk',
          chunkId: 'chunk-big',
          index: i,
          count,
          byteLength: bytes,
          data: b64.slice(i * 8, (i + 1) * 8)
        })
      }
      break
    }
    case 'ping_echo':
      respond(cmd.id, 'ping_echo', { echo: cmd.value ?? null })
      break
    case 'boom':
      // malformed output line on purpose
      process.stdout.write('{not json\n')
      respond(cmd.id, 'boom', {})
      break
    case 'slow':
      // respond out of order relative to a later fast command
      setTimeout(() => respond(cmd.id, 'slow', { slow: true }), 150)
      break
    case 'die': {
      const line = JSON.stringify({ id: cmd.id, type: 'response', command: 'die', success: true, data: {} }) + '\n'
      process.stdout.write(line, () => setTimeout(() => process.exit(0), 50))
      break
    }
    default:
      respond(cmd.id, cmd.type, {})
  }
})
