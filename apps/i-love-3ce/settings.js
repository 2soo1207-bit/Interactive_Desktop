export const DEFAULT_WORDS = ['I', 'love', '3CE', 'so', 'much']
export const WORD_COLORS = ['#FFFFFF', '#FFFFFF', '#E0EC89', '#FFFFFF', '#FFFFFF']
export const SETTINGS_KEY = 'test2.hand-tracking.v1'
export const defaults = () => ({ words: [...DEFAULT_WORDS], english: '', chinese: '' })
export function loadSettings(storage) {
  try {
    const stored = JSON.parse((storage ?? globalThis.localStorage).getItem(SETTINGS_KEY))
    return {
      words: DEFAULT_WORDS.map((word, index) => typeof stored?.words?.[index] === 'string' && stored.words[index].trim() ? stored.words[index].trim().slice(0, 40) : word),
      english: typeof stored?.english === 'string' ? stored.english : '',
      chinese: typeof stored?.chinese === 'string' ? stored.chinese : '',
    }
  } catch { return defaults() }
}
export function spokenWord(word) {
  if (/^3ce$/i.test(word.trim())) return 'three C E'
  return Array.from(word.trim()).length === 1 ? `${word.trim()}.` : word.trim()
}
const SPECIAL = /\b(Albert|Bad News|Bells|Boing|Bubbles|Cellos|Wobble|Zarvox|Jester|Fred)\b/i
export function languageFor(word) { return /[㐀-鿿]/u.test(word) ? 'zh-CN' : 'en-US' }
export function chooseVoice(voices, lang, preferred = '') {
  const matching = voices.filter(voice => voice.lang.toLowerCase().startsWith(lang.startsWith('zh') ? 'zh' : 'en') && !SPECIAL.test(voice.name))
  return matching.find(voice => voice.voiceURI === preferred)
    ?? matching.find(voice => /Samantha|Ava|Allison/i.test(voice.name))
    ?? matching.find(voice => /Google/i.test(voice.name))
    ?? matching.find(voice => voice.lang.toLowerCase() === lang.toLowerCase())
    ?? matching.find(voice => voice.default)
    ?? matching[0]
}
