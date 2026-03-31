const QUICK_DIRS = [
  { label: 'Home', path: '~', icon: '🏠' },
  { label: 'Desktop', path: '~/Desktop', icon: '🖥️' },
  { label: 'Downloads', path: '~/Downloads', icon: '📥' },
  { label: 'Documents', path: '~/Documents', icon: '📄' },
  { label: 'Pictures', path: '~/Pictures', icon: '🖼️' },
  { label: 'Music', path: '~/Music', icon: '🎵' },
  { label: 'Videos', path: '~/Videos', icon: '🎬' },
]

export default function Sidebar({ open, currentDir, tasks, onNavigate, onClose }) {
  if (!open) return null

  return (
    <div className="w-60 flex-shrink-0 bg-[#0d0d16] border-r border-white/10 flex flex-col overflow-hidden">
      {/* Logo */}
      <div className="px-4 py-4 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-800 flex items-center justify-center text-white text-xs font-bold">
            A
          </div>
          <span className="font-semibold text-white text-sm">ARIA</span>
          <span className="ml-auto text-xs text-slate-600">v1.0</span>
        </div>
      </div>

      {/* Quick Directories */}
      <div className="px-3 py-3 flex-1 overflow-y-auto">
        <p className="text-xs text-slate-600 uppercase tracking-wider px-2 mb-2 font-semibold">Quick Access</p>
        <div className="space-y-0.5">
          {QUICK_DIRS.map(dir => (
            <button
              key={dir.path}
              onClick={() => onNavigate(dir.path)}
              className={`w-full flex items-center gap-2.5 px-2 py-2 rounded-lg text-sm transition-all text-left
                ${currentDir === dir.path
                  ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span className="text-base">{dir.icon}</span>
              <span>{dir.label}</span>
              {currentDir === dir.path && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-violet-400" />
              )}
            </button>
          ))}
        </div>

        {/* Tasks */}
        {tasks.length > 0 && (
          <div className="mt-4">
            <p className="text-xs text-slate-600 uppercase tracking-wider px-2 mb-2 font-semibold">Tasks</p>
            <div className="space-y-1">
              {tasks.map((task, i) => (
                <div key={i} className="flex items-start gap-2 px-2 py-1.5 rounded-lg bg-white/3 text-xs text-slate-400">
                  <div className={`w-4 h-4 rounded flex-shrink-0 mt-0.5 flex items-center justify-center border
                    ${task.done ? 'bg-violet-500/30 border-violet-500/50' : 'border-white/20'}`}
                  >
                    {task.done && <span className="text-violet-400 text-[10px]">✓</span>}
                  </div>
                  <span className={task.done ? 'line-through text-slate-600' : ''}>{task.text}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Footer hint */}
      <div className="px-4 py-3 border-t border-white/10">
        <p className="text-xs text-slate-700 text-center leading-relaxed">
          Powered by Claude AI
        </p>
      </div>
    </div>
  )
}
