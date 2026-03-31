import ReactMarkdown from 'react-markdown'
import { useState } from 'react'

function ToolResultCard({ result }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <div className="mt-2 bg-[#0f0f1a] border border-violet-500/20 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-400 hover:bg-violet-500/10 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
        </svg>
        <span className="font-mono font-semibold">{result.tool}</span>
        <span className="text-slate-600">—</span>
        <span className="text-slate-500 truncate">{result.summary}</span>
        <svg
          className={`w-3.5 h-3.5 ml-auto transition-transform ${expanded ? 'rotate-180' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {expanded && (
        <pre className="px-3 py-2 text-xs text-slate-400 overflow-x-auto border-t border-violet-500/10 font-mono whitespace-pre-wrap">
          {result.output}
        </pre>
      )}
    </div>
  )
}

export default function ChatMessage({ message, onSpeak }) {
  const isUser = message.role === 'user'

  const formatTime = (iso) => {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  if (isUser) {
    return (
      <div className="flex justify-end message-anim">
        <div className="max-w-[75%]">
          <div className="bg-violet-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-relaxed">
            {message.content}
          </div>
          <div className="text-xs text-slate-600 text-right mt-1">{formatTime(message.timestamp)}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex items-start gap-3 message-anim">
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex-shrink-0 flex items-center justify-center text-white text-xs font-bold mt-0.5">
        A
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={`rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed
            ${message.type === 'error' ? 'bg-red-500/10 border border-red-500/20' : 'bg-[#1e1e2e]'}
          `}
        >
          <div className="prose prose-invert prose-sm max-w-none
            prose-headings:text-violet-300 prose-headings:font-semibold
            prose-strong:text-white prose-strong:font-semibold
            prose-code:text-violet-300 prose-code:bg-violet-500/10 prose-code:px-1 prose-code:py-0.5 prose-code:rounded
            prose-pre:bg-[#0f0f1a] prose-pre:border prose-pre:border-white/5
            prose-a:text-violet-400
            prose-ul:space-y-1 prose-li:text-slate-300
            prose-p:text-slate-300
          ">
            <ReactMarkdown>{message.content}</ReactMarkdown>
          </div>
        </div>

        {message.toolResults?.map((r, i) => (
          <ToolResultCard key={i} result={r} />
        ))}

        <div className="flex items-center gap-2 mt-1 px-1">
          <div className="text-xs text-slate-600">{formatTime(message.timestamp)}</div>
          {!isUser && onSpeak && (
            <button 
              onClick={() => onSpeak(message.content)}
              className="text-slate-600 hover:text-violet-400 transition-colors p-1"
              title="Speak response"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
