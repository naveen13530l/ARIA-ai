import { useState, useRef } from 'react'

const QUICK_ACTIONS = [
  { label: '📂 Downloads', msg: 'list files in ~/Downloads' },
  { label: '🖥️ Desktop', msg: 'list files on Desktop' },
  { label: '🚀 VS Code', msg: 'open VS Code' },
  { label: '🌐 Chrome', msg: 'open Google Chrome' },
  { label: '🗂️ Organize', msg: 'help me organize my Downloads folder by file type' },
]

export default function InputBar({ onSend, isLoading, isListening, isSpeaking, onStartListening }) {
  const [value, setValue] = useState('')
  const textareaRef = useRef(null)

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  function submit() {
    if (!value.trim() || isLoading) return
    onSend(value.trim())
    setValue('')
    textareaRef.current?.focus()
  }

  function handleInput(e) {
    setValue(e.target.value)
    // auto-resize
    const ta = textareaRef.current
    if (ta) {
      ta.style.height = 'auto'
      ta.style.height = Math.min(ta.scrollHeight, 150) + 'px'
    }
  }

  return (
    <div className="border-t border-white/10 bg-[#13131a] px-4 py-3 rounded-b-2xl">
      {/* Quick actions */}
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.label}
            onClick={() => onSend(a.msg)}
            disabled={isLoading || isListening}
            className="flex-shrink-0 text-xs px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-slate-400 hover:bg-violet-500/20 hover:border-violet-500/40 hover:text-violet-300 transition-all disabled:opacity-40"
          >
            {a.label}
          </button>
        ))}
      </div>

      {/* Input area */}
      <div className="flex items-end gap-3 bg-[#1e1e2e] border border-white/10 rounded-2xl px-4 py-3 focus-within:border-violet-500/50 transition-colors">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder="Ask ARIA anything… 'open VS Code', 'organize Downloads', 'find my resume'"
          rows={1}
          className="flex-1 bg-transparent text-sm text-white placeholder-slate-600 resize-none outline-none leading-relaxed"
          style={{ minHeight: '24px', maxHeight: '150px' }}
          disabled={isLoading || isListening}
        />
        
        <div className="flex items-center gap-2 mb-0.5">
          <button
            onClick={onStartListening}
            className={`w-8 h-8 rounded-xl transition-all flex items-center justify-center
              ${isListening 
                ? 'bg-red-500 text-white animate-pulse' 
                : isSpeaking 
                  ? 'bg-blue-500/20 text-blue-400' 
                  : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            title="Voice input"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </button>

          <button
            onClick={submit}
            disabled={!value.trim() || isLoading || isListening}
            className="w-8 h-8 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-all flex-shrink-0 shadow-lg shadow-violet-500/20"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
      </div>
      <p className="text-[10px] text-slate-700 text-center mt-2 font-medium tracking-wide">
        Press ENTER to send · SHIFT+ENTER for new line
      </p>
    </div>
  )
}
