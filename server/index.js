import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json({ limit: '2mb' }))

const DATA_PATH = path.join(__dirname, 'data', 'quiz.json')

function loadData() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8')
    const data = JSON.parse(raw)
    return normalize(data)
  } catch (e) {
    console.warn('Cannot read data file, using sample.', e.message)
    return normalize(getSample())
  }
}

function normalize(src) {
  const multiple = Array.isArray(src.multiple) ? src.multiple : []
  const truefalse = Array.isArray(src.truefalse) ? src.truefalse : []
  multiple.forEach(q => { q.choices = Array.isArray(q.choices) ? q.choices : [] })
  truefalse.forEach(q => { q.statements = Array.isArray(q.statements) ? q.statements : [] })
  return { multiple, truefalse }
}

function getSample() {
  return {
    multiple: [
      { id: 1, text: 'AI là gì?', explain: 'Khả năng máy thực hiện nhiệm vụ trí tuệ.', choices: [
        { key: 'A', text: 'Khả năng máy tính làm việc trí tuệ.', correct: true },
        { key: 'B', text: 'Một hệ điều hành.', correct: false },
        { key: 'C', text: 'Một ngôn ngữ lập trình.', correct: false },
        { key: 'D', text: 'Một thiết bị mạng.', correct: false }
      ] }
    ],
    truefalse: [
      { id: 101, text: 'Nhận định đúng/sai:', statements: [
        { key: 'a', text: 'Router dùng để định tuyến.', answer: true, explain: 'Đúng: Router định tuyến gói tin.' },
        { key: 'b', text: 'Switch là thiết bị lớp 7.', answer: false, explain: 'Sai: Switch (thông dụng) ở lớp 2.' }
      ] }
    ]
  }
}

const full = loadData()

function sanitize(data) {
  return {
    multiple: data.multiple.map(q => ({
      id: q.id, text: q.text, explain: q.explain || '',
      choices: q.choices.map(c => ({ key: c.key, text: c.text }))
    })),
    truefalse: data.truefalse.map(q => ({
      id: q.id, text: q.text,
      statements: q.statements.map(s => ({ key: s.key, text: s.text, explain: s.explain || '' }))
    }))
  }
}

app.get('/api/quiz', (req, res) => {
  res.json(sanitize(full))
})

app.post('/api/check', (req, res) => {
  const { type } = req.body || {}
  if (type === 'mc') {
    const { id, key } = req.body
    const q = full.multiple.find(x => x.id === id)
    if (!q) return res.status(404).json({ correct: false })
    const correctChoice = q.choices.find(c => c.correct)
    const correct = !!(correctChoice && correctChoice.key === key)
    return res.json({ correct, correctKey: correctChoice ? correctChoice.key : null, explain: q.explain || '' })
  }
  if (type === 'tf') {
    const { id, statementKey, value } = req.body
    const q = full.truefalse.find(x => x.id === id)
    if (!q) return res.status(404).json({ correct: false })
    const st = q.statements.find(s => s.key === statementKey)
    if (!st) return res.status(404).json({ correct: false })
    const correct = !!st.answer === !!value
    return res.json({ correct, explain: st.explain || '' })
  }
  res.status(400).json({ error: 'Invalid payload' })
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => console.log('Quiz server listening on', PORT))

