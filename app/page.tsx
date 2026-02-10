'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { callAIAgent } from '@/lib/aiAgent'
import { copyToClipboard } from '@/lib/clipboard'
import {
  Loader2,
  Send,
  RefreshCw,
  Copy,
  Check,
  AlertCircle,
  Search,
  Info,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'

// Theme colors extracted from Emerald theme HSL values (raw values only, no hsl() wrapper)
const THEME_VARS = {
  '--background': '160 35% 96%',
  '--foreground': '160 35% 8%',
  '--card': '160 30% 99%',
  '--card-foreground': '160 35% 8%',
  '--popover': '160 30% 99%',
  '--popover-foreground': '160 35% 8%',
  '--primary': '160 85% 35%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '160 30% 93%',
  '--secondary-foreground': '160 35% 12%',
  '--accent': '45 95% 50%',
  '--accent-foreground': '160 35% 12%',
  '--muted': '160 25% 90%',
  '--muted-foreground': '160 25% 40%',
  '--destructive': '0 84% 60%',
  '--destructive-foreground': '0 0% 100%',
  '--border': '160 28% 88%',
  '--input': '160 25% 85%',
  '--ring': '160 85% 35%',
  '--radius': '0.875rem',
} as React.CSSProperties

const AGENT_ID = '698b28fbd6b1284eb616bf79'
const AGENT_NAME = 'Chat Agent'

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  followUpSuggestions?: string[]
  isError?: boolean
}

const SAMPLE_MESSAGES: ChatMessage[] = [
  {
    id: 'sample-1',
    role: 'user',
    content: 'Hello! Can you tell me what you can help me with?',
    timestamp: '2:30 PM',
  },
  {
    id: 'sample-2',
    role: 'assistant',
    content: 'Hello! I can help you with a wide range of queries, including answering general knowledge questions, providing recommendations, assisting with planning or organization, offering explanations on various topics, and supporting basic problem-solving. If you have a specific task or question in mind, just let me know, and I\u2019ll do my best to assist you!',
    timestamp: '2:30 PM',
    followUpSuggestions: [
      'What would you like help with today?',
      'Are you looking for information on a specific topic?',
      'Can I assist you with planning or recommendations?',
    ],
  },
  {
    id: 'sample-3',
    role: 'user',
    content: 'Can you help me plan a weekend trip to the mountains?',
    timestamp: '2:31 PM',
  },
  {
    id: 'sample-4',
    role: 'assistant',
    content: "Absolutely! I'd love to help you plan a mountain getaway. Here are some things to consider:\n\n**1. Destination**\nChoose a mountain range that fits your travel distance and preferences. Popular options include the Rockies, Appalachians, or Sierra Nevada.\n\n**2. Activities**\n- Hiking and trail exploration\n- Wildlife photography\n- Camping or cabin stay\n- Mountain biking\n- Stargazing\n\n**3. Packing Essentials**\n- Layered clothing for changing weather\n- Sturdy hiking boots\n- Sunscreen and hat\n- First aid kit\n- Plenty of water and snacks\n\n**4. Accommodation**\nConsider booking a cozy cabin or lodge for a more comfortable experience, or pack a tent for a true wilderness adventure.\n\nWould you like me to go deeper into any of these areas?",
    timestamp: '2:32 PM',
    followUpSuggestions: [
      'Tell me more about hiking trails',
      'What should I pack for cold weather?',
      'Suggest some mountain destinations near me',
    ],
  },
]

const CONVERSATION_STARTERS = [
  'What can you help me with?',
  'Tell me an interesting fact',
  'Help me brainstorm ideas',
  'Explain a complex topic simply',
]

function parseAgentResponse(result: any): { text: string; suggestions: string[] } {
  let text = ''
  let suggestions: string[] = []

  try {
    // Primary path: result.data.response
    if (result?.data?.response) {
      text = String(result.data.response)
      if (Array.isArray(result?.data?.follow_up_suggestions)) {
        suggestions = result.data.follow_up_suggestions
      }
      return { text, suggestions }
    }

    // If result itself has a response field (flat structure)
    if (result?.response && typeof result.response === 'string') {
      text = result.response
      if (Array.isArray(result?.follow_up_suggestions)) {
        suggestions = result.follow_up_suggestions
      }
      return { text, suggestions }
    }

    // Try to parse result if it is a string containing JSON
    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result)
        if (parsed?.data?.response) {
          text = String(parsed.data.response)
          if (Array.isArray(parsed?.data?.follow_up_suggestions)) {
            suggestions = parsed.data.follow_up_suggestions
          }
          return { text, suggestions }
        }
        if (parsed?.response) {
          text = String(parsed.response)
          return { text, suggestions }
        }
      } catch {
        text = result
        return { text, suggestions }
      }
    }

    // Fallback: extract any recognizable text field
    if (result?.summary) text = String(result.summary)
    else if (result?.text) text = String(result.text)
    else if (result?.message) text = String(result.message)
    else if (result?.answer) text = String(result.answer)
    else if (result != null) {
      text = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result)
    } else {
      text = 'No response received.'
    }
  } catch {
    text = 'Unable to parse response.'
  }

  return { text, suggestions }
}

function renderInline(text: string): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2]) {
      parts.push(<strong key={match.index} className="font-semibold text-foreground">{match[2]}</strong>)
    } else if (match[4]) {
      parts.push(
        <code key={match.index} className="px-1.5 py-0.5 rounded bg-muted text-xs font-mono text-secondary-foreground">{match[4]}</code>
      )
    }
    lastIndex = regex.lastIndex
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

function MarkdownRenderer({ content }: { content: string }) {
  const lines = (content ?? '').split('\n')

  return (
    <div className="space-y-1.5 leading-relaxed" style={{ letterSpacing: '-0.01em', lineHeight: '1.55' }}>
      {lines.map((line, i) => {
        const trimmed = line.trim()

        if (trimmed === '') return <div key={i} className="h-1.5" />

        if (trimmed.startsWith('### ')) {
          return <h3 key={i} className="font-semibold text-sm mt-3 mb-1 text-foreground">{renderInline(trimmed.slice(4))}</h3>
        }
        if (trimmed.startsWith('## ')) {
          return <h2 key={i} className="font-semibold text-base mt-3 mb-1 text-foreground">{renderInline(trimmed.slice(3))}</h2>
        }
        if (trimmed.startsWith('# ')) {
          return <h1 key={i} className="font-bold text-lg mt-3 mb-1 text-foreground">{renderInline(trimmed.slice(2))}</h1>
        }

        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="mt-2 w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
              <span className="text-sm">{renderInline(trimmed.slice(2))}</span>
            </div>
          )
        }

        const numMatch = trimmed.match(/^(\d+)\.\s(.+)/)
        if (numMatch) {
          return (
            <div key={i} className="flex items-start gap-2 pl-2">
              <span className="text-sm font-semibold text-primary shrink-0">{numMatch[1]}.</span>
              <span className="text-sm">{renderInline(numMatch[2])}</span>
            </div>
          )
        }

        return <p key={i} className="text-sm">{renderInline(trimmed)}</p>
      })}
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-1.5 px-4 py-3">
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '150ms' }} />
      <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
    </div>
  )
}

function MessageBubble({
  message,
  onSuggestionClick,
}: {
  message: ChatMessage
  onSuggestionClick: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const isUser = message.role === 'user'

  const handleCopy = async () => {
    await copyToClipboard(message.content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={`flex w-full mb-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[85%] md:max-w-[70%] ${isUser ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        <div
          className={`relative group rounded-2xl px-4 py-3 shadow-md ${isUser ? 'bg-primary text-primary-foreground rounded-br-sm' : message.isError ? 'bg-destructive/10 border border-destructive/30 text-foreground rounded-bl-sm' : 'bg-card/75 backdrop-blur-md border text-card-foreground rounded-bl-sm'}`}
          style={!isUser && !message.isError ? { borderColor: 'rgba(255,255,255,0.18)' } : undefined}
        >
          {isUser ? (
            <p className="text-sm leading-relaxed" style={{ letterSpacing: '-0.01em' }}>{message.content}</p>
          ) : message.isError ? (
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-sm">{message.content}</p>
            </div>
          ) : (
            <MarkdownRenderer content={message.content} />
          )}

          {!isUser && !message.isError && (
            <button
              onClick={handleCopy}
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 p-1 rounded-md hover:bg-muted/50"
              aria-label="Copy message"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-primary" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-muted-foreground" />
              )}
            </button>
          )}
        </div>

        <span className="text-[10px] text-muted-foreground px-2">{message.timestamp}</span>

        {!isUser && Array.isArray(message?.followUpSuggestions) && message.followUpSuggestions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1 px-1">
            {message.followUpSuggestions.map((suggestion, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestionClick(suggestion)}
                className="text-xs px-3 py-1.5 rounded-full border border-border/60 bg-card/60 backdrop-blur-sm text-secondary-foreground hover:bg-secondary hover:border-primary/30 transition-all duration-200"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [inputValue, setInputValue] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [showSampleData, setShowSampleData] = useState(false)
  const [showNewChatConfirm, setShowNewChatConfirm] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const idCounterRef = useRef(0)

  const displayMessages = showSampleData && messages.length === 0 ? SAMPLE_MESSAGES : messages

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [displayMessages.length, isLoading, scrollToBottom])

  const getNextId = useCallback(() => {
    idCounterRef.current += 1
    return `msg-${idCounterRef.current}`
  }, [])

  const getTimestamp = useCallback(() => {
    try {
      return new Intl.DateTimeFormat('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(new Date())
    } catch {
      return ''
    }
  }, [])

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isLoading) return

      const ts = getTimestamp()

      const userMessage: ChatMessage = {
        id: getNextId(),
        role: 'user',
        content: trimmed,
        timestamp: ts,
      }

      setMessages((prev) => [...prev, userMessage])
      setInputValue('')
      setIsLoading(true)
      setActiveAgentId(AGENT_ID)

      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto'
      }

      try {
        const result = await callAIAgent(trimmed, AGENT_ID)
        const responseTs = getTimestamp()

        if (result?.success) {
          const parsed = parseAgentResponse(result?.response?.result)

          const assistantMessage: ChatMessage = {
            id: getNextId(),
            role: 'assistant',
            content: parsed.text || 'I received your message but have no response to display.',
            timestamp: responseTs,
            followUpSuggestions: parsed.suggestions,
          }
          setMessages((prev) => [...prev, assistantMessage])
        } else {
          const errorMessage: ChatMessage = {
            id: getNextId(),
            role: 'assistant',
            content: result?.error || result?.response?.message || 'Something went wrong. Please try again.',
            timestamp: responseTs,
            isError: true,
          }
          setMessages((prev) => [...prev, errorMessage])
        }
      } catch {
        const errorMessage: ChatMessage = {
          id: getNextId(),
          role: 'assistant',
          content: 'A network error occurred. Please check your connection and try again.',
          timestamp: getTimestamp(),
          isError: true,
        }
        setMessages((prev) => [...prev, errorMessage])
      } finally {
        setIsLoading(false)
        setActiveAgentId(null)
      }
    },
    [isLoading, getTimestamp, getNextId]
  )

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(inputValue)
    }
  }

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputValue(e.target.value)
    const ta = e.target
    ta.style.height = 'auto'
    const maxHeight = 120
    ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
  }

  const handleNewChat = () => {
    if (messages.length > 0) {
      setShowNewChatConfirm(true)
    }
  }

  const confirmNewChat = () => {
    setMessages([])
    setShowNewChatConfirm(false)
    setInputValue('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  const handleSuggestionClick = (text: string) => {
    sendMessage(text)
  }

  const handleStarterClick = (text: string) => {
    sendMessage(text)
  }

  return (
    <div
      style={THEME_VARS}
      className="min-h-screen bg-background text-foreground flex flex-col"
    >
      {/* Gradient background overlay */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, hsl(160 40% 94%) 0%, hsl(180 35% 93%) 30%, hsl(160 35% 95%) 60%, hsl(140 40% 94%) 100%)',
          zIndex: 0,
        }}
      />

      {/* Main container */}
      <div className="relative z-10 flex flex-col h-screen max-w-4xl mx-auto w-full">
        {/* Header */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border/50 bg-card/60 backdrop-blur-md" style={{ borderBottom: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Send className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground tracking-tight">Chat Assistant</h1>
              <p className="text-[11px] text-muted-foreground">Powered by AI</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">
                Sample Data
              </Label>
              <Switch
                id="sample-toggle"
                checked={showSampleData}
                onCheckedChange={setShowSampleData}
              />
            </div>

            <Separator orientation="vertical" className="h-6" />

            <Button
              variant="ghost"
              size="sm"
              onClick={handleNewChat}
              disabled={messages.length === 0}
              className="text-muted-foreground hover:text-foreground hover:bg-secondary/80 gap-1.5"
            >
              <RefreshCw className="w-4 h-4" />
              <span className="hidden sm:inline text-xs">New Chat</span>
            </Button>
          </div>
        </header>

        {/* New Chat Confirmation Bar */}
        {showNewChatConfirm && (
          <div className="px-4 md:px-6 py-2 bg-destructive/10 border-b border-destructive/20 flex items-center justify-between">
            <p className="text-sm text-foreground">Clear all messages and start a new chat?</p>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowNewChatConfirm(false)} className="text-xs h-7">
                Cancel
              </Button>
              <Button size="sm" onClick={confirmNewChat} className="text-xs h-7 bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto px-4 md:px-6 py-4" ref={scrollAreaRef}>
          {displayMessages.length === 0 && !isLoading ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-5">
                <Search className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2 tracking-tight">Welcome to Chat Assistant</h2>
              <p className="text-sm text-muted-foreground max-w-md mb-8 leading-relaxed">
                Ask me anything -- from general knowledge questions to planning help, recommendations, and creative brainstorming. Type your message below to get started.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 w-full max-w-lg">
                {CONVERSATION_STARTERS.map((starter, idx) => (
                  <button
                    key={idx}
                    onClick={() => handleStarterClick(starter)}
                    className="group text-left px-4 py-3 rounded-xl border bg-card/60 backdrop-blur-sm hover:bg-secondary hover:border-primary/30 hover:shadow-md transition-all duration-200"
                    style={{ borderColor: 'rgba(255,255,255,0.18)' }}
                  >
                    <p className="text-sm text-secondary-foreground group-hover:text-foreground transition-colors">{starter}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {displayMessages.map((msg) => (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  onSuggestionClick={handleSuggestionClick}
                />
              ))}

              {isLoading && (
                <div className="flex justify-start mb-4">
                  <div className="max-w-[85%] md:max-w-[70%]">
                    <div className="rounded-2xl rounded-bl-sm px-4 py-2 bg-card/75 backdrop-blur-md border shadow-md" style={{ borderColor: 'rgba(255,255,255,0.18)' }}>
                      <TypingIndicator />
                    </div>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="px-4 md:px-6 py-3 border-t border-border/50 bg-card/60 backdrop-blur-md" style={{ borderTop: '1px solid rgba(255,255,255,0.18)' }}>
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea
                ref={textareaRef}
                value={inputValue}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                disabled={isLoading}
                className="w-full resize-none rounded-xl border border-border/60 bg-background/80 backdrop-blur-sm px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/40 focus:border-primary/50 disabled:opacity-50 transition-all duration-200"
                style={{
                  maxHeight: '120px',
                  minHeight: '44px',
                  lineHeight: '1.55',
                  letterSpacing: '-0.01em',
                }}
              />
            </div>

            <Button
              onClick={() => sendMessage(inputValue)}
              disabled={!inputValue.trim() || isLoading}
              size="icon"
              className="rounded-xl h-11 w-11 bg-primary text-primary-foreground hover:bg-primary/90 shadow-md shadow-primary/20 transition-all duration-200 disabled:opacity-40 disabled:shadow-none shrink-0"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </Button>
          </div>

          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Press Enter to send, Shift+Enter for a new line
          </p>
        </div>

        {/* Agent Info Footer */}
        <div className="px-4 md:px-6 py-2 border-t border-border/30 bg-card/40 backdrop-blur-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Info className="w-3 h-3 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">{AGENT_NAME}</span>
              <span className="text-[10px] text-muted-foreground/60">|</span>
              <span className="text-[10px] text-muted-foreground/80 font-mono">{AGENT_ID.slice(0, 8)}...</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 rounded-full ${activeAgentId ? 'bg-amber-400 animate-pulse' : 'bg-primary'}`} />
              <span className="text-[10px] text-muted-foreground">
                {activeAgentId ? 'Processing...' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
