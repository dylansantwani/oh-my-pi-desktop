import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import 'highlight.js/styles/github-dark.css'

export function Markdown({ text }: { text: string }): React.JSX.Element {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          pre: ({ children }) => (
            <div className="code-block">
              <button
                className="copy-btn"
                onClick={() => void navigator.clipboard.writeText(extractText(children))}
              >
                copy
              </button>
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
