import express from 'express'
import cors from 'cors'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
app.use(cors())
app.use(express.json({ limit: '4mb' }))

const DATA_DIR = path.join(__dirname, 'data')
const EXAMS_PATH = path.join(DATA_DIR, 'exams.json')
const ATTEMPTS_PATH = path.join(DATA_DIR, 'attempts.json')
const LEGACY_QUIZ_PATH = path.join(DATA_DIR, 'quiz.json')
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'TinHoc2026!'
const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const adminSessions = new Map()

ensureDataFiles()

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    return fallback
  }
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function ensureDataFiles() {
  ensureDir(DATA_DIR)
  if (!fs.existsSync(EXAMS_PATH)) {
    writeJson(EXAMS_PATH, { exams: buildSampleExams() })
  }
  if (!fs.existsSync(ATTEMPTS_PATH)) {
    writeJson(ATTEMPTS_PATH, { attempts: [] })
  }
}

function listExams() {
  const data = readJson(EXAMS_PATH, { exams: [] })
  return Array.isArray(data.exams) ? data.exams : []
}

function saveExams(exams) {
  writeJson(EXAMS_PATH, { exams })
}

function listAttempts() {
  const data = readJson(ATTEMPTS_PATH, { attempts: [] })
  return Array.isArray(data.attempts) ? data.attempts : []
}

function saveAttempts(attempts) {
  writeJson(ATTEMPTS_PATH, { attempts })
}

function buildSampleExams() {
  const now = new Date().toISOString()
  const legacy = importLegacyQuiz()
  if (legacy) {
    return [{
      id: `exam-${crypto.randomUUID()}`,
      code: '0501-MAU',
      title: '�? �n thi TNTHPT Tin h?c 0501',
      description: '�? m?u kh?i t?o t? d? li?u luy?n t?p hi?n c� d? ki?m th? h? th?ng.',
      durationMinutes: 50,
      status: 'published',
      questions: legacy,
      createdAt: now,
      updatedAt: now
    }]
  }

  return [{
    id: `exam-${crypto.randomUUID()}`,
    code: '0501-MAU',
    title: '�? �n thi TNTHPT Tin h?c 0501',
    description: '�? m?u d�ng d? ki?m th? h? th?ng. Gi�o vi�n c� th? ch?nh s?a ho?c nh?p d? m?i t? JSON.',
    durationMinutes: 50,
    status: 'published',
    questions: [
      {
        id: `q-${crypto.randomUUID()}`,
        type: 'multiple_choice',
        text: 'Trong m?ng m�y t�nh, thi?t b? n�o d�ng d? d?nh tuy?n g�i tin gi?a c�c m?ng?',
        explanation: 'Router l� thi?t b? th?c hi?n ch?c nang d?nh tuy?n gi?a c�c m?ng kh�c nhau.',
        choices: [
          { key: 'A', text: 'Switch', correct: false },
          { key: 'B', text: 'Router', correct: true },
          { key: 'C', text: 'Hub', correct: false },
          { key: 'D', text: 'Access Point', correct: false }
        ]
      },
      {
        id: `q-${crypto.randomUUID()}`,
        type: 'multiple_choice',
        text: 'Th? HTML n�o bi?u di?n ti�u d? l?n nh?t tr�n trang?',
        explanation: 'Trong HTML, `h1` l� m?c ti�u d? cao nh?t.',
        choices: [
          { key: 'A', text: '<head>', correct: false },
          { key: 'B', text: '<title>', correct: false },
          { key: 'C', text: '<h1>', correct: true },
          { key: 'D', text: '<p>', correct: false }
        ]
      },
      {
        id: `q-${crypto.randomUUID()}`,
        type: 'true_false_group',
        text: '��nh gi� c�c nh?n d?nh sau v? tr� tu? nh�n t?o:',
        explanation: 'AI y?u ch? gi?i quy?t t?t c�c nhi?m v? chuy�n bi?t; d? li?u hu?n luy?n ?nh hu?ng m?nh d?n k?t qu?.',
        statements: [
          {
            key: 'a',
            text: 'AI t?o sinh c� th? t?o van b?n ho?c h�nh ?nh t? d? li?u d� h?c.',
            answer: true,
            explanation: '��y l� nang l?c di?n h�nh c?a AI t?o sinh.'
          },
          {
            key: 'b',
            text: 'AI m?nh hi?n d� du?c tri?n khai ph? bi?n trong tru?ng h?c.',
            answer: false,
            explanation: 'AI m?nh theo nghia t? nh?n th?c v?n chua t?n t?i th?c t?.'
          }
        ]
      },
      {
        id: `q-${crypto.randomUUID()}`,
        type: 'multiple_choice',
        text: '�?a ch? IP c� ch?c nang ch�nh n�o sau d�y?',
        explanation: '�?a ch? IP d�ng d? d?nh danh thi?t b? trong m?ng v� h? tr? truy?n g�i tin d?n d�ng noi nh?n.',
        choices: [
          { key: 'A', text: 'M� h�a d? li?u', correct: false },
          { key: 'B', text: '�?nh danh thi?t b? tr�n m?ng', correct: true },
          { key: 'C', text: 'N�n t?p tin', correct: false },
          { key: 'D', text: 'X? l� d? h?a', correct: false }
        ]
      },
      {
        id: `q-${crypto.randomUUID()}`,
        type: 'true_false_group',
        text: '��nh gi� c�c nh?n d?nh sau v? CSS:',
        explanation: 'CSS di?u khi?n c�ch hi?n th? c?a ph?n t? HTML, kh�ng thay th? HTML trong vi?c t?o c?u tr�c n?i dung.',
        statements: [
          {
            key: 'a',
            text: 'CSS d�ng d? d?nh d?ng m�u s?c, b? c?c v� ki?u ch? c?a trang web.',
            answer: true,
            explanation: 'CSS ch?u tr�ch nhi?m v? ph?n tr�nh b�y giao di?n.'
          },
          {
            key: 'b',
            text: 'CSS l� ng�n ng? d�ng d? thay th? ho�n to�n HTML trong c?u tr�c trang.',
            answer: false,
            explanation: 'HTML t?o c?u tr�c, CSS ch? d?nh d?ng ph?n hi?n th?.'
          }
        ]
      }
    ]
  }]
}

function importLegacyQuiz() {
  const legacy = readJson(LEGACY_QUIZ_PATH, null)
  if (!legacy || (!Array.isArray(legacy.multiple) && !Array.isArray(legacy.truefalse))) {
    return null
  }
  const questions = []
  for (const item of legacy.multiple || []) {
    const choices = Array.isArray(item.choices) ? item.choices.map(choice => ({
      key: String(choice.key || '').trim() || 'A',
      text: String(choice.text || '').trim(),
      correct: !!choice.correct
    })) : []
    if (choices.length === 4) {
      questions.push({
        id: `q-${crypto.randomUUID()}`,
        type: 'multiple_choice',
        text: String(item.text || '').trim(),
        explanation: String(item.explain || '').trim(),
        choices
      })
    }
  }
  for (const item of legacy.truefalse || []) {
    const statements = Array.isArray(item.statements) ? item.statements.map(statement => ({
      key: String(statement.key || '').trim() || randomStatementKey(),
      text: String(statement.text || '').trim(),
      answer: !!statement.answer,
      explanation: String(statement.explain || '').trim()
    })) : []
    if (statements.length) {
      questions.push({
        id: `q-${crypto.randomUUID()}`,
        type: 'true_false_group',
        text: String(item.text || '').trim(),
        explanation: '',
        statements
      })
    }
  }
  return questions.length ? questions : null
}

function cleanupAdminSessions() {
  const now = Date.now()
  for (const [token, session] of adminSessions.entries()) {
    if (now > session.expiresAt) {
      adminSessions.delete(token)
    }
  }
}

function getBearerToken(req) {
  const raw = req.headers.authorization || ''
  const match = raw.match(/^Bearer\s+(.+)$/i)
  return match ? match[1] : ''
}

function hasBearerToken(req) {
  return !!getBearerToken(req)
}

function requireAdmin(req, res, next) {
  cleanupAdminSessions()
  const token = getBearerToken(req)
  const session = token ? adminSessions.get(token) : null
  if (!session) {
    return res.status(401).json({ error: 'admin_auth_required' })
  }
  req.admin = session
  next()
}

function optionalAdmin(req) {
  cleanupAdminSessions()
  const token = getBearerToken(req)
  return token ? adminSessions.get(token) : null
}

function createAdminSession() {
  const token = crypto.randomUUID()
  const expiresAt = Date.now() + ADMIN_TOKEN_TTL_MS
  adminSessions.set(token, { token, expiresAt })
  return { token, expiresAt }
}

function randomStatementKey(index = 0) {
  return String.fromCharCode(97 + (index % 26))
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function examMeta(exam) {
  return {
    id: exam.id,
    code: exam.code,
    title: exam.title,
    description: exam.description || '',
    durationMinutes: exam.durationMinutes || 50,
    status: exam.status,
    questionCount: Array.isArray(exam.questions) ? exam.questions.length : 0,
    totalPoints: computeTotalPoints(exam.questions || []),
    createdAt: exam.createdAt,
    updatedAt: exam.updatedAt
  }
}

function sanitizeExamForStudent(exam) {
  return {
    ...examMeta(exam),
    questions: (exam.questions || []).map(question => {
      if (question.type === 'multiple_choice') {
        return {
          id: question.id,
          type: question.type,
          text: question.text,
          choices: (question.choices || []).map(choice => ({
            key: choice.key,
            text: choice.text
          }))
        }
      }
      return {
        id: question.id,
        type: question.type,
        text: question.text,
        statements: (question.statements || []).map(statement => ({
          key: statement.key,
          text: statement.text
        }))
      }
    })
  }
}

function sanitizeExamForAdmin(exam) {
  return clone({
    ...examMeta(exam),
    questions: exam.questions || []
  })
}

function assert(condition, message, code = 400) {
  if (!condition) {
    const error = new Error(message)
    error.statusCode = code
    throw error
  }
}

function normalizeExamPayload(payload, existingExam = null) {
  const source = payload || {}
  const now = new Date().toISOString()
  const questions = Array.isArray(source.questions) ? source.questions.map((question, index) => normalizeQuestion(question, index)) : []
  const exam = {
    id: existingExam?.id || source.id || `exam-${crypto.randomUUID()}`,
    code: String(source.code || existingExam?.code || '').trim(),
    title: String(source.title || existingExam?.title || '').trim(),
    description: String(source.description || existingExam?.description || '').trim(),
    durationMinutes: 50,
    status: source.status === 'published' ? 'published' : 'draft',
    questions,
    createdAt: existingExam?.createdAt || now,
    updatedAt: now
  }

  assert(exam.code, 'M� d? kh�ng du?c d? tr?ng.')
  assert(exam.title, 'Ti�u d? d? thi kh�ng du?c d? tr?ng.')
  assert(exam.questions.length > 0, '�? thi ph?i c� �t nh?t m?t c�u h?i.')

  const codeConflict = listExams().find(item => item.code === exam.code && item.id !== exam.id)
  assert(!codeConflict, 'M� d? d� t?n t?i.')

  return exam
}

function normalizeQuestion(question, index) {
  const base = {
    id: question?.id || `q-${crypto.randomUUID()}`,
    type: String(question?.type || '').trim(),
    text: String(question?.text || '').trim(),
    explanation: String(question?.explanation || '').trim()
  }

  assert(base.text, `C�u h?i ${index + 1} chua c� n?i dung.`)
  assert(base.type === 'multiple_choice' || base.type === 'true_false_group', `C�u h?i ${index + 1} c� lo?i kh�ng h?p l?.`)

  if (base.type === 'multiple_choice') {
    const choices = Array.isArray(question.choices) ? question.choices.map((choice, choiceIndex) => ({
      key: String(choice.key || String.fromCharCode(65 + choiceIndex)).trim().toUpperCase(),
      text: String(choice.text || '').trim(),
      correct: !!choice.correct
    })) : []
    assert(choices.length === 4, `C�u h?i ${index + 1} ph?i c� d�ng 4 l?a ch?n.`)
    assert(choices.every(choice => choice.text), `C�u h?i ${index + 1} c� l?a ch?n r?ng.`)
    assert(choices.filter(choice => choice.correct).length === 1, `C�u h?i ${index + 1} ph?i c� d�ng 1 d�p �n d�ng.`)
    return { ...base, choices }
  }

  const statements = Array.isArray(question.statements) ? question.statements.map((statement, statementIndex) => ({
    key: String(statement.key || randomStatementKey(statementIndex)).trim().toLowerCase(),
    text: String(statement.text || '').trim(),
    answer: !!statement.answer,
    explanation: String(statement.explanation || '').trim()
  })) : []
  assert(statements.length >= 2, `C�u d�ng/sai ${index + 1} ph?i c� �t nh?t 2 nh?n d?nh.`)
  assert(statements.every(statement => statement.text), `C�u d�ng/sai ${index + 1} c� nh?n d?nh r?ng.`)
  return { ...base, statements }
}

function validateStudent(student) {
  const normalized = {
    name: String(student?.name || '').trim(),
    className: String(student?.className || '').trim(),
    studentCode: String(student?.studentCode || '').trim()
  }
  assert(normalized.name, 'H? t�n kh�ng du?c d? tr?ng.')
  assert(normalized.className, 'L?p kh�ng du?c d? tr?ng.')
  assert(normalized.studentCode, 'M� h?c sinh/SBD kh�ng du?c d? tr?ng.')
  return normalized
}

function computeTotalPoints(questions) {
  return (questions || []).reduce((sum, question) => {
    if (question.type === 'true_false_group') {
      return sum + (question.statements || []).length
    }
    return sum + 1
  }, 0)
}

function evaluateAttempt(exam, answers, durationUsedSeconds) {
  const answerMap = answers && typeof answers === 'object' ? answers : {}
  const review = []
  let correctCount = 0
  let incorrectCount = 0
  let answeredCount = 0

  for (const question of exam.questions || []) {
    if (question.type === 'multiple_choice') {
      const submittedKey = String(answerMap[question.id] || '').trim().toUpperCase()
      const correctChoice = (question.choices || []).find(choice => choice.correct)
      const isAnswered = !!submittedKey
      const isCorrect = !!correctChoice && submittedKey === correctChoice.key
      if (isAnswered) answeredCount += 1
      if (isCorrect) correctCount += 1
      else if (isAnswered) incorrectCount += 1

      review.push({
        questionId: question.id,
        type: question.type,
        text: question.text,
        submittedAnswer: submittedKey || null,
        correctAnswer: correctChoice ? correctChoice.key : null,
        isCorrect,
        isAnswered,
        explanation: question.explanation || '',
        choices: (question.choices || []).map(choice => ({
          key: choice.key,
          text: choice.text,
          correct: !!choice.correct
        }))
      })
      continue
    }

    const submittedGroup = answerMap[question.id] && typeof answerMap[question.id] === 'object' ? answerMap[question.id] : {}
    const statementReviews = (question.statements || []).map(statement => {
      const rawValue = submittedGroup[statement.key]
      const isAnswered = rawValue === true || rawValue === false
      const isCorrect = isAnswered && !!rawValue === !!statement.answer
      if (isAnswered) answeredCount += 1
      if (isCorrect) correctCount += 1
      else if (isAnswered) incorrectCount += 1
      return {
        key: statement.key,
        text: statement.text,
        submittedAnswer: isAnswered ? !!rawValue : null,
        correctAnswer: !!statement.answer,
        isCorrect,
        isAnswered,
        explanation: statement.explanation || ''
      }
    })

    review.push({
      questionId: question.id,
      type: question.type,
      text: question.text,
      explanation: question.explanation || '',
      statements: statementReviews
    })
  }

  const totalPoints = computeTotalPoints(exam.questions || [])
  const unansweredCount = Math.max(totalPoints - answeredCount, 0)
  const score = totalPoints > 0 ? Number(((correctCount / totalPoints) * 10).toFixed(2)) : 0

  return {
    score,
    summary: {
      totalPoints,
      correctCount,
      incorrectCount,
      unansweredCount,
      answeredCount,
      completionRate: totalPoints > 0 ? Number(((answeredCount / totalPoints) * 100).toFixed(1)) : 0,
      accuracyRate: totalPoints > 0 ? Number(((correctCount / totalPoints) * 100).toFixed(1)) : 0,
      durationUsedSeconds: Math.max(Number(durationUsedSeconds) || 0, 0)
    },
    review
  }
}

function summarizeResults(examId) {
  const attempts = listAttempts().filter(item => item.examId === examId && item.status === 'submitted')
  const scores = attempts.map(item => Number(item.score) || 0)
  const averageScore = scores.length ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(2)) : 0
  const highestScore = scores.length ? Math.max(...scores) : 0
  const lowestScore = scores.length ? Math.min(...scores) : 0
  const distribution = {
    below5: 0,
    from5to7: 0,
    from7to8_5: 0,
    from8_5to10: 0
  }

  for (const score of scores) {
    if (score < 5) distribution.below5 += 1
    else if (score < 7) distribution.from5to7 += 1
    else if (score < 8.5) distribution.from7to8_5 += 1
    else distribution.from8_5to10 += 1
  }

  return {
    attemptCount: attempts.length,
    averageScore,
    highestScore,
    lowestScore,
    distribution,
    attempts: attempts
      .slice()
      .sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime())
      .map(item => ({
        id: item.id,
        student: item.student,
        examId: item.examId,
        examTitle: item.examTitle,
        score: item.score,
        summary: item.summary,
        startedAt: item.startedAt,
        submittedAt: item.submittedAt
      }))
  }
}

function buildAttemptStorage(attempt) {
  return {
    id: attempt.id,
    examId: attempt.examId,
    examTitle: attempt.examTitle,
    student: attempt.student,
    startedAt: attempt.startedAt,
    submittedAt: attempt.submittedAt || null,
    durationUsedSeconds: attempt.durationUsedSeconds || 0,
    status: attempt.status || 'in_progress',
    answers: attempt.answers || {},
    score: typeof attempt.score === 'number' ? attempt.score : null,
    summary: attempt.summary || null,
    review: attempt.review || null,
    updatedAt: attempt.updatedAt || new Date().toISOString()
  }
}

function findExamOrThrow(examId) {
  const exam = listExams().find(item => item.id === examId)
  assert(exam, 'Kh�ng t�m th?y d? thi.', 404)
  return exam
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    adminPasswordConfiguredFromEnv: !!process.env.ADMIN_PASSWORD
  })
})

app.post('/api/admin/login', (req, res) => {
  const password = String(req.body?.password || '')
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'invalid_admin_password' })
  }
  const session = createAdminSession()
  res.json({
    token: session.token,
    expiresAt: session.expiresAt
  })
})

app.get('/api/exams', (req, res) => {
  const admin = optionalAdmin(req)
  if (hasBearerToken(req) && !admin) {
    return res.status(401).json({ error: 'admin_auth_required' })
  }
  const exams = listExams()
    .filter(exam => admin || exam.status === 'published')
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .map(examMeta)
  res.json({ exams })
})

app.get('/api/exams/:id', (req, res) => {
  try {
    const exam = findExamOrThrow(req.params.id)
    const admin = optionalAdmin(req)
    if (hasBearerToken(req) && !admin) {
      return res.status(401).json({ error: 'admin_auth_required' })
    }
    if (!admin && exam.status !== 'published') {
      return res.status(404).json({ error: 'exam_not_found' })
    }
    res.json(admin ? sanitizeExamForAdmin(exam) : sanitizeExamForStudent(exam))
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.post('/api/exams', requireAdmin, (req, res) => {
  try {
    const exams = listExams()
    const exam = normalizeExamPayload(req.body)
    exams.unshift(exam)
    saveExams(exams)
    res.status(201).json({ exam: sanitizeExamForAdmin(exam) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.put('/api/exams/:id', requireAdmin, (req, res) => {
  try {
    const exams = listExams()
    const index = exams.findIndex(item => item.id === req.params.id)
    assert(index >= 0, 'Kh�ng t�m th?y d? thi.', 404)
    const exam = normalizeExamPayload({ ...req.body, id: req.params.id, status: req.body?.status || exams[index].status }, exams[index])
    exams[index] = exam
    saveExams(exams)
    res.json({ exam: sanitizeExamForAdmin(exam) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.delete('/api/exams/:id', requireAdmin, (req, res) => {
  try {
    const exams = listExams()
    const next = exams.filter(item => item.id !== req.params.id)
    assert(next.length !== exams.length, 'Kh�ng t�m th?y d? thi.', 404)
    saveExams(next)
    res.json({ ok: true })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.post('/api/exams/:id/publish', requireAdmin, (req, res) => {
  try {
    const exams = listExams()
    const index = exams.findIndex(item => item.id === req.params.id)
    assert(index >= 0, 'Kh�ng t�m th?y d? thi.', 404)
    const nextStatus = req.body?.status === 'draft' ? 'draft' : 'published'
    exams[index] = {
      ...exams[index],
      status: nextStatus,
      updatedAt: new Date().toISOString()
    }
    saveExams(exams)
    res.json({ exam: sanitizeExamForAdmin(exams[index]) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.post('/api/exams/import', requireAdmin, (req, res) => {
  try {
    const raw = req.body?.exam ?? req.body
    const normalized = normalizeExamPayload(raw)
    const exams = listExams()
    exams.unshift(normalized)
    saveExams(exams)
    res.status(201).json({ exam: sanitizeExamForAdmin(normalized) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.get('/api/exams/:id/export', requireAdmin, (req, res) => {
  try {
    const exam = findExamOrThrow(req.params.id)
    res.json({ exam: sanitizeExamForAdmin(exam) })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.post('/api/attempts/start', (req, res) => {
  try {
    const exam = findExamOrThrow(String(req.body?.examId || ''))
    assert(exam.status === 'published', '�? thi chua du?c ph�t h�nh.', 400)
    const student = validateStudent(req.body?.student)
    const now = new Date().toISOString()
    const attempt = buildAttemptStorage({
      id: `attempt-${crypto.randomUUID()}`,
      examId: exam.id,
      examTitle: exam.title,
      student,
      startedAt: now,
      status: 'in_progress',
      answers: {}
    })
    const attempts = listAttempts()
    attempts.unshift(attempt)
    saveAttempts(attempts)
    res.status(201).json({
      attemptId: attempt.id,
      exam: sanitizeExamForStudent(exam),
      startedAt: attempt.startedAt
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.put('/api/attempts/:id/save', (req, res) => {
  try {
    const attempts = listAttempts()
    const index = attempts.findIndex(item => item.id === req.params.id)
    assert(index >= 0, 'Kh�ng t�m th?y lu?t l�m b�i.', 404)
    assert(attempts[index].status === 'in_progress', 'Lu?t l�m b�i d� n?p.', 400)
    attempts[index] = buildAttemptStorage({
      ...attempts[index],
      answers: req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : attempts[index].answers,
      durationUsedSeconds: Number(req.body?.durationUsedSeconds) || attempts[index].durationUsedSeconds || 0,
      updatedAt: new Date().toISOString()
    })
    saveAttempts(attempts)
    res.json({ ok: true, updatedAt: attempts[index].updatedAt })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.post('/api/attempts/:id/submit', (req, res) => {
  try {
    const attempts = listAttempts()
    const index = attempts.findIndex(item => item.id === req.params.id)
    assert(index >= 0, 'Kh�ng t�m th?y lu?t l�m b�i.', 404)
    const stored = attempts[index]
    if (stored.status === 'submitted') {
      return res.json({
        attemptId: stored.id,
        score: stored.score,
        summary: stored.summary,
        review: stored.review
      })
    }

    const exam = findExamOrThrow(stored.examId)
    const answers = req.body?.answers && typeof req.body.answers === 'object' ? req.body.answers : stored.answers
    const durationUsedSeconds = Number(req.body?.durationUsedSeconds) || stored.durationUsedSeconds || 0
    const result = evaluateAttempt(exam, answers, durationUsedSeconds)

    attempts[index] = buildAttemptStorage({
      ...stored,
      answers,
      durationUsedSeconds,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      score: result.score,
      summary: result.summary,
      review: result.review
    })
    saveAttempts(attempts)

    res.json({
      attemptId: attempts[index].id,
      score: attempts[index].score,
      summary: attempts[index].summary,
      review: attempts[index].review
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.get('/api/results', requireAdmin, (req, res) => {
  try {
    const examId = String(req.query.examId || '').trim()
    assert(examId, 'Thi?u examId.', 400)
    const exam = findExamOrThrow(examId)
    res.json({
      exam: examMeta(exam),
      stats: summarizeResults(examId)
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

app.get('/api/results/:attemptId', requireAdmin, (req, res) => {
  try {
    const attempt = listAttempts().find(item => item.id === req.params.attemptId)
    assert(attempt, 'Kh�ng t�m th?y k?t qu?.', 404)
    res.json({
      attemptId: attempt.id,
      examId: attempt.examId,
      examTitle: attempt.examTitle,
      student: attempt.student,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      summary: attempt.summary,
      review: attempt.review
    })
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'server_error' })
  }
})

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Exam server listening on http://localhost:${PORT}`)
  console.log(`Admin password source: ${process.env.ADMIN_PASSWORD ? 'ENV' : 'DEFAULT'}`)
})
