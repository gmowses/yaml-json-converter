import { useState, useCallback, useEffect, useRef } from 'react'
import YAML from 'yaml'
import {
  Copy, Check, Sun, Moon, Languages, ArrowRight, ArrowLeft,
  AlignLeft, AlertCircle, X, FileCode2,
} from 'lucide-react'

// ── i18n ──────────────────────────────────────────────────────────────────────
const translations = {
  en: {
    title: 'YAML / JSON Converter',
    subtitle: 'Convert, validate and prettify YAML and JSON instantly. Everything runs client-side.',
    yamlSide: 'YAML',
    jsonSide: 'JSON',
    yamlPlaceholder: 'Paste YAML here...',
    jsonPlaceholder: 'Paste JSON here...',
    convertToJson: 'YAML \u2192 JSON',
    convertToYaml: 'JSON \u2192 YAML',
    format: 'Format',
    copy: 'Copy',
    copied: 'Copied!',
    clear: 'Clear',
    valid: 'Valid',
    invalid: 'Invalid',
    empty: 'Empty',
    errorLine: 'Line',
    stats: 'Stats',
    keys: 'keys',
    depth: 'depth',
    autoDetect: 'Auto-detect',
    builtBy: 'Built by',
    errorYaml: 'Invalid YAML',
    errorJson: 'Invalid JSON',
    tipYaml: 'Paste YAML on the left and click YAML \u2192 JSON',
    tipJson: 'Paste JSON on the right and click JSON \u2192 YAML',
    characters: 'chars',
    lines: 'lines',
  },
  pt: {
    title: 'Conversor YAML / JSON',
    subtitle: 'Converta, valide e formate YAML e JSON instantaneamente. Tudo no navegador.',
    yamlSide: 'YAML',
    jsonSide: 'JSON',
    yamlPlaceholder: 'Cole o YAML aqui...',
    jsonPlaceholder: 'Cole o JSON aqui...',
    convertToJson: 'YAML \u2192 JSON',
    convertToYaml: 'JSON \u2192 YAML',
    format: 'Formatar',
    copy: 'Copiar',
    copied: 'Copiado!',
    clear: 'Limpar',
    valid: 'Valido',
    invalid: 'Invalido',
    empty: 'Vazio',
    errorLine: 'Linha',
    stats: 'Stats',
    keys: 'chaves',
    depth: 'profundidade',
    autoDetect: 'Auto-detectar',
    builtBy: 'Criado por',
    errorYaml: 'YAML invalido',
    errorJson: 'JSON invalido',
    tipYaml: 'Cole o YAML na esquerda e clique YAML \u2192 JSON',
    tipJson: 'Cole o JSON na direita e clique JSON \u2192 YAML',
    characters: 'chars',
    lines: 'linhas',
  },
} as const

type Lang = keyof typeof translations

// ── Validation & parsing ───────────────────────────────────────────────────────
interface ParseResult {
  ok: boolean
  value: unknown
  errorMsg: string
  errorLine: number | null
}

function parseYaml(text: string): ParseResult {
  if (!text.trim()) return { ok: false, value: null, errorMsg: '', errorLine: null }
  try {
    const value = YAML.parse(text, { prettyErrors: true })
    return { ok: true, value, errorMsg: '', errorLine: null }
  } catch (e: unknown) {
    const err = e as { message?: string; linePos?: Array<{ line: number }> }
    const line = err.linePos?.[0]?.line ?? null
    return { ok: false, value: null, errorMsg: err.message ?? 'Parse error', errorLine: line }
  }
}

function parseJson(text: string): ParseResult {
  if (!text.trim()) return { ok: false, value: null, errorMsg: '', errorLine: null }
  try {
    const value = JSON.parse(text) as unknown
    return { ok: true, value, errorMsg: '', errorLine: null }
  } catch (e: unknown) {
    const err = e as { message?: string }
    // Extract line number from "at position N" or "line N"
    const msg = err.message ?? 'Parse error'
    const lineMatch = msg.match(/line (\d+)/i)
    const line = lineMatch ? parseInt(lineMatch[1], 10) : null
    return { ok: false, value: null, errorMsg: msg, errorLine: line }
  }
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function countKeys(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0
  if (Array.isArray(val)) return val.reduce<number>((s, v) => s + countKeys(v), 0)
  const obj = val as Record<string, unknown>
  return Object.keys(obj).length + Object.values(obj).reduce<number>((s, v) => s + countKeys(v), 0)
}

function calcDepth(val: unknown): number {
  if (val === null || typeof val !== 'object') return 0
  if (Array.isArray(val)) return val.length === 0 ? 1 : 1 + Math.max(...val.map(calcDepth))
  const obj = val as Record<string, unknown>
  const vals = Object.values(obj)
  return vals.length === 0 ? 1 : 1 + Math.max(...vals.map(calcDepth))
}

// ── Syntax highlighting ────────────────────────────────────────────────────────
// Renders colored spans from plain text — no external lib required.
// Strategy: line-by-line for YAML, token regex for JSON.

const COLORS = {
  key:     { light: '#7c3aed', dark: '#c084fc' },   // purple
  string:  { light: '#059669', dark: '#34d399' },   // green
  number:  { light: '#d97706', dark: '#fbbf24' },   // amber
  bool:    { light: '#0284c7', dark: '#38bdf8' },   // blue
  null_:   { light: '#64748b', dark: '#94a3b8' },   // slate
  colon:   { light: '#64748b', dark: '#94a3b8' },
  bracket: { light: '#374151', dark: '#d1d5db' },
  dash:    { light: '#7c3aed', dark: '#c084fc' },
  comment: { light: '#94a3b8', dark: '#64748b' },
}

type ColorKey = keyof typeof COLORS

function span(text: string, key: ColorKey, dark: boolean) {
  return `<span style="color:${COLORS[key][dark ? 'dark' : 'light']}">${escHtml(text)}</span>`
}

function escHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function highlightYaml(text: string, dark: boolean): string {
  return text.split('\n').map(line => {
    // comment
    if (/^\s*#/.test(line)) return span(line, 'comment', dark)
    // list item dash
    const dashMatch = line.match(/^(\s*)(- )(.*)$/)
    if (dashMatch) {
      const [, indent, dash, rest] = dashMatch
      return escHtml(indent) + span(dash, 'dash', dark) + highlightYamlValue(rest, dark)
    }
    // key: value
    const kvMatch = line.match(/^(\s*)([^:]+?)(\s*:\s*)(.*)$/)
    if (kvMatch) {
      const [, indent, key, colon, val] = kvMatch
      return escHtml(indent) + span(key, 'key', dark) + span(colon, 'colon', dark) + highlightYamlValue(val, dark)
    }
    return escHtml(line)
  }).join('\n')
}

function highlightYamlValue(val: string, dark: boolean): string {
  if (!val) return ''
  const v = val.trim()
  if (v === 'true' || v === 'false') return span(val, 'bool', dark)
  if (v === 'null' || v === '~') return span(val, 'null_', dark)
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v)) return span(val, 'number', dark)
  if (/^['"]/.test(v)) return span(val, 'string', dark)
  // plain string
  return escHtml(val)
}

function highlightJson(text: string, dark: boolean): string {
  // Token-based highlighting over raw text
  const tokens: Array<[string, ColorKey | null]> = []
  let i = 0
  while (i < text.length) {
    // string
    if (text[i] === '"') {
      let j = i + 1
      while (j < text.length) {
        if (text[j] === '\\') { j += 2; continue }
        if (text[j] === '"') { j++; break }
        j++
      }
      const raw = text.slice(i, j)
      // peek ahead (skip whitespace) for colon -> it's a key
      let k = j
      while (k < text.length && (text[k] === ' ' || text[k] === '\t')) k++
      tokens.push([raw, text[k] === ':' ? 'key' : 'string'])
      i = j
      continue
    }
    // number
    const numMatch = text.slice(i).match(/^-?\d+(\.\d+)?([eE][+-]?\d+)?/)
    if (numMatch) {
      tokens.push([numMatch[0], 'number'])
      i += numMatch[0].length
      continue
    }
    // bool / null
    const kwMatch = text.slice(i).match(/^(true|false|null)/)
    if (kwMatch) {
      const kw = kwMatch[0]
      tokens.push([kw, kw === 'null' ? 'null_' : 'bool'])
      i += kw.length
      continue
    }
    // bracket / colon / comma
    if ('[]{}:,'.includes(text[i])) {
      tokens.push([text[i], 'bracket'])
      i++
      continue
    }
    // whitespace / newline — pass through uncolored
    let j = i
    while (j < text.length && !' \t\n\r[]{}:,"0123456789-tfn'.includes(text[j])) j++
    if (j === i) j = i + 1
    tokens.push([text.slice(i, j), null])
    i = j
  }

  return tokens.map(([raw, key]) => key ? span(raw, key, dark) : escHtml(raw)).join('')
}

// ── Status badge ──────────────────────────────────────────────────────────────
type Status = 'valid' | 'invalid' | 'empty'

function getStatus(text: string, parse: ParseResult): Status {
  if (!text.trim()) return 'empty'
  return parse.ok ? 'valid' : 'invalid'
}

// ── Highlighted textarea overlay ──────────────────────────────────────────────
// We render a <pre> behind a transparent <textarea> so the user can edit freely
// while seeing syntax colors.

interface HighlightedEditorProps {
  value: string
  onChange: (v: string) => void
  placeholder: string
  highlight: (text: string) => string
  dark: boolean
  id: string
}

function HighlightedEditor({ value, onChange, placeholder, highlight, dark, id }: HighlightedEditorProps) {
  const taRef = useRef<HTMLTextAreaElement>(null)
  const preRef = useRef<HTMLPreElement>(null)

  const syncScroll = () => {
    if (taRef.current && preRef.current) {
      preRef.current.scrollTop = taRef.current.scrollTop
      preRef.current.scrollLeft = taRef.current.scrollLeft
    }
  }

  const highlighted = value ? highlight(value) : ''

  const baseStyle: React.CSSProperties = {
    fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Consolas', monospace",
    fontSize: '13px',
    lineHeight: '1.6',
    letterSpacing: '0.01em',
    padding: '12px 14px',
    margin: 0,
    border: 'none',
    outline: 'none',
    resize: 'none',
    whiteSpace: 'pre',
    overflowWrap: 'normal',
    overflow: 'auto',
    width: '100%',
    height: '100%',
    boxSizing: 'border-box' as const,
    tabSize: 2,
  }

  return (
    <div className="relative w-full h-full" style={{ minHeight: 0 }}>
      {/* Highlight layer */}
      <pre
        ref={preRef}
        aria-hidden
        style={{
          ...baseStyle,
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          color: dark ? '#e2e8f0' : '#1e293b',
          background: 'transparent',
          overflow: 'hidden',
        }}
        dangerouslySetInnerHTML={{ __html: highlighted || `<span style="color:${dark ? '#475569' : '#94a3b8'}">${escHtml(placeholder)}</span>` }}
      />
      {/* Editable layer */}
      <textarea
        id={id}
        ref={taRef}
        value={value}
        onChange={e => onChange(e.target.value)}
        onScroll={syncScroll}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        style={{
          ...baseStyle,
          position: 'relative',
          color: 'transparent',
          caretColor: dark ? '#e2e8f0' : '#1e293b',
          background: 'transparent',
          zIndex: 1,
        }}
      />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function YamlJsonConverter() {
  const [lang, setLang] = useState<Lang>(() => (navigator.language.startsWith('pt') ? 'pt' : 'en'))
  const [dark, setDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)
  const [yamlText, setYamlText] = useState('')
  const [jsonText, setJsonText] = useState('')
  const [copiedYaml, setCopiedYaml] = useState(false)
  const [copiedJson, setCopiedJson] = useState(false)
  const [convertError, setConvertError] = useState('')

  const t = translations[lang]

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  // Live parse for validation display
  const yamlParse = parseYaml(yamlText)
  const jsonParse = parseJson(jsonText)
  const yamlStatus = getStatus(yamlText, yamlParse)
  const jsonStatus = getStatus(jsonText, jsonParse)

  // Stats
  const yamlStats = yamlParse.ok && yamlParse.value !== null
    ? { keys: countKeys(yamlParse.value), depth: calcDepth(yamlParse.value) }
    : null
  const jsonStats = jsonParse.ok && jsonParse.value !== null
    ? { keys: countKeys(jsonParse.value), depth: calcDepth(jsonParse.value) }
    : null

  // Highlight functions (memoised per dark mode)
  const hlYaml = useCallback((text: string) => highlightYaml(text, dark), [dark])
  const hlJson = useCallback((text: string) => highlightJson(text, dark), [dark])

  // ── Conversion ────────────────────────────────────────────────────────────
  const handleYamlToJson = useCallback(() => {
    setConvertError('')
    if (!yamlText.trim()) return
    const result = parseYaml(yamlText)
    if (!result.ok) {
      setConvertError(`${t.errorYaml}: ${result.errorMsg}`)
      return
    }
    setJsonText(JSON.stringify(result.value, null, 2))
  }, [yamlText, t])

  const handleJsonToYaml = useCallback(() => {
    setConvertError('')
    if (!jsonText.trim()) return
    const result = parseJson(jsonText)
    if (!result.ok) {
      setConvertError(`${t.errorJson}: ${result.errorMsg}`)
      return
    }
    setYamlText(YAML.stringify(result.value, { indent: 2 }))
  }, [jsonText, t])

  // ── Format / prettify ─────────────────────────────────────────────────────
  const handleFormatYaml = useCallback(() => {
    const result = parseYaml(yamlText)
    if (result.ok && result.value !== null) {
      setYamlText(YAML.stringify(result.value, { indent: 2 }))
    }
  }, [yamlText])

  const handleFormatJson = useCallback(() => {
    const result = parseJson(jsonText)
    if (result.ok) {
      setJsonText(JSON.stringify(result.value, null, 2))
    }
  }, [jsonText])

  // ── Copy ─────────────────────────────────────────────────────────────────
  const copy = (text: string, setCopied: (v: boolean) => void) => {
    if (!text) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // ── Status badge style ────────────────────────────────────────────────────
  const statusStyle = (s: Status) => {
    if (s === 'valid')   return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
    if (s === 'invalid') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
    return 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
  }

  const statusLabel = (s: Status) => {
    if (s === 'valid')   return t.valid
    if (s === 'invalid') return t.invalid
    return t.empty
  }

  // ── Line / char count ─────────────────────────────────────────────────────
  const textInfo = (text: string) => {
    if (!text) return null
    const lines = text.split('\n').length
    const chars = text.length
    return { lines, chars }
  }

  const yamlInfo = textInfo(yamlText)
  const jsonInfo = textInfo(jsonText)

  // ── Error box ─────────────────────────────────────────────────────────────
  const yamlErr = !yamlParse.ok && yamlText.trim() ? yamlParse : null
  const jsonErr = !jsonParse.ok && jsonText.trim() ? jsonParse : null

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 transition-colors">

      {/* ── Header ── */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-3 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-purple-500 rounded-lg flex items-center justify-center shrink-0">
              <FileCode2 size={16} className="text-white" />
            </div>
            <div>
              <span className="font-semibold text-sm leading-none block">YAML / JSON</span>
              <span className="text-[10px] text-zinc-400 leading-none">Converter</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang(l => l === 'en' ? 'pt' : 'en')}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <Languages size={13} />
              {lang.toUpperCase()}
            </button>
            <button
              onClick={() => setDark(d => !d)}
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              {dark ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <a
              href="https://github.com/gmowses/yaml-json-converter"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
              </svg>
            </a>
          </div>
        </div>
      </header>

      {/* ── Hero ── */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-4 shrink-0">
        <div className="max-w-[1600px] mx-auto">
          <h1 className="text-xl font-bold">{t.title}</h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">{t.subtitle}</p>
        </div>
      </div>

      {/* ── Action bar ── */}
      <div className="border-b border-zinc-200 dark:border-zinc-800 px-4 py-2 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center gap-2 flex-wrap">
          <button
            onClick={handleYamlToJson}
            disabled={!yamlText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowRight size={13} />
            {t.convertToJson}
          </button>
          <button
            onClick={handleJsonToYaml}
            disabled={!jsonText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white text-xs font-semibold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={13} />
            {t.convertToYaml}
          </button>

          <div className="w-px h-4 bg-zinc-200 dark:bg-zinc-700 mx-1" />

          <button
            onClick={handleFormatYaml}
            disabled={!yamlParse.ok || !yamlText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <AlignLeft size={13} />
            {t.format} YAML
          </button>
          <button
            onClick={handleFormatJson}
            disabled={!jsonParse.ok || !jsonText.trim()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 text-xs font-medium hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <AlignLeft size={13} />
            {t.format} JSON
          </button>

          {convertError && (
            <div className="flex items-center gap-1.5 ml-2 text-xs text-red-600 dark:text-red-400">
              <AlertCircle size={13} />
              <span className="max-w-xs truncate">{convertError}</span>
              <button onClick={() => setConvertError('')} className="hover:text-red-800 dark:hover:text-red-300">
                <X size={12} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Editors ── */}
      <main className="flex-1 flex min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-h-0 min-w-0 border-r border-zinc-200 dark:border-zinc-800">
          {/* YAML header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">{t.yamlSide}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusStyle(yamlStatus)}`}>
                {statusLabel(yamlStatus)}
              </span>
              {yamlStats && (
                <span className="text-[10px] text-zinc-400">
                  {yamlStats.keys} {t.keys} &middot; {t.depth} {yamlStats.depth}
                </span>
              )}
              {yamlInfo && (
                <span className="text-[10px] text-zinc-400">
                  {yamlInfo.lines} {t.lines} &middot; {yamlInfo.chars} {t.characters}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => copy(yamlText, setCopiedYaml)}
                disabled={!yamlText}
                title={t.copy}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30"
              >
                {copiedYaml ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copiedYaml ? t.copied : t.copy}
              </button>
              <button
                onClick={() => { setYamlText(''); setConvertError('') }}
                disabled={!yamlText}
                title={t.clear}
                className="p-1 rounded text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* YAML error */}
          {yamlErr && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 shrink-0">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                {yamlErr.errorLine ? `${t.errorLine} ${yamlErr.errorLine}: ` : ''}
                {yamlErr.errorMsg}
              </span>
            </div>
          )}

          {/* YAML editor */}
          <div
            className="flex-1 min-h-0 overflow-hidden"
            style={{ background: dark ? '#0f0f13' : '#fafafa' }}
          >
            <HighlightedEditor
              id="yaml-editor"
              value={yamlText}
              onChange={v => { setYamlText(v); setConvertError('') }}
              placeholder={t.yamlPlaceholder}
              highlight={hlYaml}
              dark={dark}
            />
          </div>
        </div>

        {/* ── JSON panel ── */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0">
          {/* JSON header */}
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider">{t.jsonSide}</span>
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${statusStyle(jsonStatus)}`}>
                {statusLabel(jsonStatus)}
              </span>
              {jsonStats && (
                <span className="text-[10px] text-zinc-400">
                  {jsonStats.keys} {t.keys} &middot; {t.depth} {jsonStats.depth}
                </span>
              )}
              {jsonInfo && (
                <span className="text-[10px] text-zinc-400">
                  {jsonInfo.lines} {t.lines} &middot; {jsonInfo.chars} {t.characters}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => copy(jsonText, setCopiedJson)}
                disabled={!jsonText}
                title={t.copy}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30"
              >
                {copiedJson ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                {copiedJson ? t.copied : t.copy}
              </button>
              <button
                onClick={() => { setJsonText(''); setConvertError('') }}
                disabled={!jsonText}
                title={t.clear}
                className="p-1 rounded text-zinc-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors disabled:opacity-30"
              >
                <X size={12} />
              </button>
            </div>
          </div>

          {/* JSON error */}
          {jsonErr && (
            <div className="flex items-start gap-2 px-3 py-2 bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-400 shrink-0">
              <AlertCircle size={13} className="mt-0.5 shrink-0" />
              <span>
                {jsonErr.errorLine ? `${t.errorLine} ${jsonErr.errorLine}: ` : ''}
                {jsonErr.errorMsg}
              </span>
            </div>
          )}

          {/* JSON editor */}
          <div
            className="flex-1 min-h-0 overflow-hidden"
            style={{ background: dark ? '#0f0f13' : '#fafafa' }}
          >
            <HighlightedEditor
              id="json-editor"
              value={jsonText}
              onChange={v => { setJsonText(v); setConvertError('') }}
              placeholder={t.jsonPlaceholder}
              highlight={hlJson}
              dark={dark}
            />
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 px-4 py-2.5 shrink-0">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between text-xs text-zinc-400">
          <span>
            {t.builtBy}{' '}
            <a
              href="https://github.com/gmowses"
              className="text-zinc-600 dark:text-zinc-300 hover:text-purple-500 transition-colors"
            >
              Gabriel Mowses
            </a>
          </span>
          <span>MIT License</span>
        </div>
      </footer>
    </div>
  )
}
