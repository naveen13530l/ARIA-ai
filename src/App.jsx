import { useState, useRef, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatMessage from './components/ChatMessage'
import InputBar from './components/InputBar'
import StatusBar from './components/StatusBar'

const WELCOME = {
  id: 'welcome',
  role: 'assistant',
  content: `Welcome to **ARIA** — your intelligent workspace assistant.

I can help you with:

• **File Management** — Browse, search, organize, and manage your files
• **App Launching** — Open applications like VS Code, Chrome, Spotify, and more
• **System Information** — Get details about your computer and storage

*Powered by Google Gemini AI with real-time tool execution.*

To get started, just type a command or use the microphone to speak!`,
  timestamp: new Date().toISOString(),
  type: 'welcome'
}

export default function App() {
  const [messages, setMessages] = useState([WELCOME])
  const [isLoading, setIsLoading] = useState(false)
  const [currentDir, setCurrentDir] = useState('~')
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [tasks, setTasks] = useState([
    { text: 'Analyze system resources', done: true },
    { text: 'Organize Downloads folder', done: false },
    { text: 'Check for software updates', done: false }
  ])
  const [selectedModel, setSelectedModel] = useState('gemini-2.0-flash')
  const [responseTime, setResponseTime] = useState(null)
  
  // Voice states
  const [isListening, setIsListening] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [transcript, setTranscript] = useState('')

  const messagesEndRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  useEffect(() => {
    // Sync current directory with server on mount
    fetch('/api/status')
      .then(res => res.json())
      .then(data => {
        if (data.currentDir) setCurrentDir(data.currentDir)
      })
      .catch(() => {})
  }, [])

  // Voice effect
  useEffect(() => {
    if (!isListening && transcript.trim() !== '') {
      const finalTranscript = transcript
      setTranscript('')
      sendMessage(finalTranscript)
    }
  }, [isListening, transcript])

  const startListening = async () => {
    if (isListening) {
      recognitionRef.current?.stop()
      return
    }

    if (window.speechSynthesis) window.speechSynthesis.cancel()
    setTranscript('')

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.')
      return
    }

    try {
      const recognition = new SpeechRecognition()
      recognition.continuous = false
      recognition.interimResults = true
      recognition.lang = 'en-US'
      
      recognition.onstart = () => setIsListening(true)
      recognition.onresult = (event) => {
        let currentTranscript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          currentTranscript += event.results[i][0].transcript
        }
        setTranscript(currentTranscript)
      }
      recognition.onerror = () => setIsListening(false)
      recognition.onend = () => setIsListening(false)
      
      recognitionRef.current = recognition
      recognition.start()
    } catch (err) {
      setIsListening(false)
    }
  }

  const speakResponse = (text) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const cleanText = text.replace(/[#_*[\]()~`>]/g, '')
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 1.0
      
      utterance.onstart = () => setIsSpeaking(true)
      utterance.onend = () => setIsSpeaking(false)
      utterance.onerror = () => setIsSpeaking(false)
      
      window.speechSynthesis.speak(utterance)
    }
  }

  const sendMessage = async (content) => {
    if (!content.trim() || isLoading) return

    const userMsg = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date().toISOString()
    }

    setMessages(prev => [...prev, userMsg])
    setIsLoading(true)
    const startTime = Date.now()

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].filter(m => m.id !== 'welcome').map(m => ({
            role: m.role,
            content: m.content
          })),
          currentDir,
          model: selectedModel,
          parameter: 'Balanced'
        })
      })

      const data = await res.json()
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
      setResponseTime(elapsed)

      if (data.error) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `**Error:** ${data.error}`,
          timestamp: new Date().toISOString(),
          type: 'error'
        }])
      } else {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: data.content,
          timestamp: new Date().toISOString(),
          toolResults: data.toolResults
        }])
        speakResponse(data.content)
        if (data.currentDir) setCurrentDir(data.currentDir)
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: '**Connection Error:** Server unreachable.',
        timestamp: new Date().toISOString(),
        type: 'error'
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleNavigate = (path) => {
    setCurrentDir(path)
    sendMessage(`list files in ${path}`)
  }

  return (
    <div className="flex h-screen bg-[#08080c] text-slate-200 font-sans overflow-hidden scanline">
      <Sidebar 
        open={isSidebarOpen} 
        currentDir={currentDir} 
        tasks={tasks}
        onNavigate={handleNavigate}
        onClose={() => setIsSidebarOpen(false)}
      />

      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#08080c]/80 backdrop-blur-md">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/5 rounded-lg transition-colors text-slate-400"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <StatusBar currentDir={currentDir} />
          </div>

          <div className="flex items-center gap-3">
             <select 
              value={selectedModel} 
              onChange={(e) => setSelectedModel(e.target.value)}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-violet-500/50 transition-colors"
            >
              <option value="gemini-2.0-flash">Gemini 2.0 Flash</option>
              <option value="gemini-1.5-flash">Gemini 1.5 Flash</option>
              <option value="nvidia:llama-3.3-70b">Llama 3.3 70B (Fallback)</option>
            </select>
            {responseTime && (
              <span className="text-[10px] text-slate-500 bg-white/5 px-2 py-1 rounded-md border border-white/5 font-mono">
                {responseTime}s
              </span>
            )}
          </div>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto px-4 py-8">
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map(msg => (
              <ChatMessage key={msg.id} message={msg} onSpeak={speakResponse} />
            ))}
            {isLoading && (
              <div className="flex items-start gap-3 message-anim opacity-50">
                <div className="w-8 h-8 rounded-full bg-violet-600 flex-shrink-0 flex items-center justify-center">
                  <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                </div>
                <div className="text-sm text-slate-500 italic mt-1.5">thinking...</div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input area */}
        <div className="max-w-3xl mx-auto w-full pb-6 relative">
          {isListening && (
            <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-violet-600 px-4 py-2 rounded-full shadow-lg z-20 animate-bounce">
              <div className="w-2 h-2 bg-white rounded-full animate-ping" />
              <span className="text-xs font-medium text-white">{transcript || 'Listening...'}</span>
            </div>
          )}
          <InputBar 
            onSend={sendMessage} 
            isLoading={isLoading} 
            isListening={isListening}
            isSpeaking={isSpeaking}
            onStartListening={startListening}
          />
        </div>
      </main>
    </div>
  )
}
