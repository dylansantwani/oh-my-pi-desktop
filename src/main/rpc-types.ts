export type RpcOutbound =
  | { id?: string; type: 'prompt'; message: string; images?: unknown[]; streamingBehavior?: 'steer' | 'followUp' }
  | { id?: string; type: 'steer'; message: string }
  | { id?: string; type: 'follow_up'; message: string }
  | { id?: string; type: 'abort' }
  | { id?: string; type: 'abort_and_prompt'; message: string }
  | { id?: string; type: 'new_session'; parentSession?: string }
  | { id?: string; type: 'get_state' }
  | { id?: string; type: 'set_fast_mode'; enabled: boolean }
  | { id?: string; type: 'get_available_models' }
  | { id?: string; type: 'set_model'; provider: string; modelId: string }
  | { id?: string; type: 'set_thinking_level'; level: string }
  | { id?: string; type: 'export_html'; outputPath?: string }
  | { id?: string; type: 'switch_session'; sessionPath: string }
  | { id?: string; type: 'set_session_name'; name: string }
  | { id?: string; type: 'get_messages_page'; cursor?: string; limit?: number }
  | { id?: string; type: 'get_session_stats' }

export interface RpcResponse {
  id?: string
  type: 'response'
  command: string
  success: boolean
  data?: unknown
  error?: string
  code?: string
}

export interface ReadyFrame {
  type: 'ready'
  protocolVersion: number
  supportedProtocolVersions: number[]
  maxFrameBytes: number
  maxReassembledFrameBytes: number
}

export interface RpcChunkFrame {
  type: 'rpc_chunk'
  chunkId: string
  index: number
  count: number
  byteLength: number
  data: string
}

export type AgentEvent = Record<string, unknown> & { type: string }
