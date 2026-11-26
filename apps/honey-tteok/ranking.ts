import { NICKNAME_LIMIT, RANKING_LIMIT } from './config'

export interface ScoreRecord {
  id: string
  nickname: string
  score: number
  savedAt: number
}

export interface RankingStore {
  list(): Promise<ScoreRecord[]>
  save(record: ScoreRecord): Promise<ScoreRecord[]>
}

const storageKey = '3ce-honey-tteok-scores-v1'

function isScoreRecord(row: unknown): row is ScoreRecord {
  if (!row || typeof row !== 'object') return false
  const value = row as Partial<ScoreRecord>
  return typeof value.id === 'string'
    && typeof value.nickname === 'string'
    && Boolean(value.nickname.trim())
    && value.nickname.length <= NICKNAME_LIMIT
    && Number.isSafeInteger(value.score)
    && Number.isFinite(value.savedAt)
}

function top(records: ScoreRecord[]) {
  return records.sort((a, b) => b.score - a.score || a.savedAt - b.savedAt).slice(0, RANKING_LIMIT)
}

export function browserRanking(): RankingStore {
  function read() {
    const stored = localStorage.getItem(storageKey)
    if (!stored) return []
    let parsed: unknown
    try { parsed = JSON.parse(stored) }
    catch { return [] }
    return Array.isArray(parsed) ? top(parsed.filter(isScoreRecord)) : []
  }

  return {
    async list() { return read() },
    async save(record) {
      const records = read()
      if (records.some(({ id }) => id === record.id)) return records
      const ranked = top([...records, record])
      localStorage.setItem(storageKey, JSON.stringify(ranked))
      return ranked
    },
  }
}
