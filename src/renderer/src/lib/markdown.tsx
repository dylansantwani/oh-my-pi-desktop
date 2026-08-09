import React, { useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
// Not highlight.js's own stylesheet: each of those pins a single palette, and
// the dark one rendered light-theme code at ~1.5:1. See styles/code.css.
import '../styles/code.css'

function CopyButton({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [copied, setCopied] = useState(false)
  return (
    <button
      className={`copy-btn ${copied ? 'copied' : ''}`}
      onClick={() => {
        void navigator.clipboard.writeText(extractText(children)).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        })
      }}
    >
      {copied ? 'Copied ✓' : 'Copy'}
    </button>
  )
}

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <div className="code-block">
              <CopyButton>{children}</CopyButton>
              <pre>{children}</pre>
            </div>
          )
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

function extractText(node: React.ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode } | null
    return props?.children ? extractText(props.children) : ''
  }
  return ''
}
