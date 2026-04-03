const ADMIN_TOKEN_TTL_MS = 12 * 60 * 60 * 1000
const EXAM_DO_NAME = 'tnthpt-tin-hoc'

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders() })
    }

    try {
      if (isCounterRoute(url.pathname)) {
        return await proxyCounterRequest(request, env, url)
      }

      if (isExamRoute(url.pathname)) {
        return await proxyExamRequest(request, env, url)
      }

      return jsonResponse({ error: 'not_found' }, 404)
    } catch (error) {
      return jsonResponse({ error: 'server_error', message: error.message || 'Unknown error' }, 500)
    }
  }
}

function isCounterRoute(pathname) {
  return pathname === '/api/hit'
    || pathname === '/api/online/ping'
    || pathname === '/api/online/leave'
    || pathname === '/api/online/get'
}

function isExamRoute(pathname) {
  return pathname === '/api/health'
    || pathname === '/api/admin/login'
    || pathname === '/api/exams'
    || pathname.startsWith('/api/exams/')
    || pathname === '/api/exams/import'
    || pathname === '/api/results'
    || pathname.startsWith('/api/results/')
    || pathname === '/api/attempts/start'
    || pathname.startsWith('/api/attempts/')
}

async function proxyCounterRequest(request, env, url) {
  const payload = request.method === 'POST'
    ? await request.json().catch(() => ({}))
    : Object.fromEntries(url.searchParams)

  const ns = String(payload.ns || '').trim()
  if (!ns) return jsonResponse({ error: 'missing_ns' }, 400)

  const id = env.COUNTER_DO.idFromName(ns)
  const stub = env.COUNTER_DO.get(id)
  const response = await stub.fetch('https://counter' + url.pathname, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  })
  return attachCors(response)
}

async function proxyExamRequest(request, env, url) {
  const id = env.EXAM_DO.idFromName(EXAM_DO_NAME)
  const stub = env.EXAM_DO.get(id)
  const headers = {}
  const contentType = request.headers.get('content-type')
  const authorization = request.headers.get('authorization')
  if (contentType) headers['content-type'] = contentType
  if (authorization) headers.authorization = authorization

  const init = {
    method: request.method,
    headers
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.text()
  }

  const response = await stub.fetch('https://exam' + url.pathname + url.search, init)
  return attachCors(response)
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json',
      ...corsHeaders(),
      ...extraHeaders
    }
  })
}

function attachCors(response) {
  const headers = new Headers(response.headers)
  Object.entries(corsHeaders()).forEach(([key, value]) => headers.set(key, value))
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  })
}

export class CounterDO {
  constructor(state) {
    this.state = state
    this.sessions = new Map()
    this.TZ = 7
  }

  async fetch(request) {
    const url = new URL(request.url)
    const payload = request.method === 'POST'
      ? await request.json().catch(() => ({}))
      : Object.fromEntries(url.searchParams)

    if (url.pathname === '/api/hit') return this.hit()
    if (url.pathname === '/api/online/ping') return this.ping(payload)
    if (url.pathname === '/api/online/leave') return this.leave(payload)
    if (url.pathname === '/api/online/get') return this.getOnline()
    return jsonResponse({ error: 'not_found' }, 404)
  }

  nowLocal() {
    return new Date(Date.now() + this.TZ * 3600 * 1000)
  }

  dayKey() {
    const d = this.nowLocal()
    const y = d.getUTCFullYear()
    const m = (`0${d.getUTCMonth() + 1}`).slice(-2)
    const day = (`0${d.getUTCDate()}`).slice(-2)
    return `day-${y}${m}${day}`
  }

  monthKey() {
    const d = this.nowLocal()
    const y = d.getUTCFullYear()
    const m = (`0${d.getUTCMonth() + 1}`).slice(-2)
    return `month-${y}${m}`
  }

  async hit() {
    const totalKey = 'total'
    const dayKey = this.dayKey()
    const monthKey = this.monthKey()
    const values = await this.state.storage.get([totalKey, dayKey, monthKey])
    const total = (values.get(totalKey) || 0) + 1
    const today = (values.get(dayKey) || 0) + 1
    const month = (values.get(monthKey) || 0) + 1
    await this.state.storage.put({ [totalKey]: total, [dayKey]: today, [monthKey]: month })
    return jsonResponse({ total, today, month })
  }

  cleanSessions() {
    const now = Date.now()
    const ttl = 20_000
    for (const [token, ts] of this.sessions.entries()) {
      if (now - ts > ttl) this.sessions.delete(token)
    }
  }

  async ping(payload) {
    this.cleanSessions()
    let token = payload?.token
    if (!token) token = crypto.randomUUID()
    this.sessions.set(token, Date.now())
    return jsonResponse({ online: this.sessions.size, token })
  }

  async leave(payload) {
    if (payload?.token) this.sessions.delete(payload.token)
    this.cleanSessions()
    return jsonResponse({ online: this.sessions.size })
  }

  async getOnline() {
    this.cleanSessions()
    return jsonResponse({ online: this.sessions.size })
  }
}

export class ExamSystemDO {
  constructor(state, env) {
    this.state = state
    this.env = env
  }

  async fetch(request) {
    const url = new URL(request.url)
    const body = await readBody(request)
    await this.ensureSeeded()

    try {
      if (url.pathname === '/api/health') {
        return jsonResponse({ ok: true, mode: 'cloudflare-worker', adminPasswordConfigured: !!this.env.ADMIN_PASSWORD })
      }

      if (url.pathname === '/api/admin/login' && request.method === 'POST') {
        return this.handleAdminLogin(body)
      }

      if (url.pathname === '/api/exams' && request.method === 'GET') {
        return this.handleListExams(request)
      }

      if (url.pathname === '/api/exams' && request.method === 'POST') {
        return this.requireAdmin(request, () => this.handleCreateExam(body))
      }

      if (url.pathname === '/api/exams/import' && request.method === 'POST') {
        return this.requireAdmin(request, () => this.handleImportExam(body))
      }

      if (url.pathname.startsWith('/api/exams/') && request.method === 'GET' && url.pathname.endsWith('/export')) {
        return this.requireAdmin(request, () => this.handleExportExam(url.pathname.split('/')[3]))
      }

      if (url.pathname.startsWith('/api/exams/') && request.method === 'POST' && url.pathname.endsWith('/publish')) {
        return this.requireAdmin(request, () => this.handlePublishExam(url.pathname.split('/')[3], body))
      }

      if (url.pathname.startsWith('/api/exams/') && request.method === 'GET') {
        return this.handleGetExam(request, url.pathname.split('/')[3])
      }

      if (url.pathname.startsWith('/api/exams/') && request.method === 'PUT') {
        return this.requireAdmin(request, () => this.handleUpdateExam(url.pathname.split('/')[3], body))
      }

      if (url.pathname.startsWith('/api/exams/') && request.method === 'DELETE') {
        return this.requireAdmin(request, () => this.handleDeleteExam(url.pathname.split('/')[3]))
      }

      if (url.pathname === '/api/attempts/start' && request.method === 'POST') {
        return this.handleStartAttempt(body)
      }

      if (url.pathname.startsWith('/api/attempts/') && request.method === 'PUT' && url.pathname.endsWith('/save')) {
        return this.handleSaveAttempt(url.pathname.split('/')[3], body)
      }

      if (url.pathname.startsWith('/api/attempts/') && request.method === 'POST' && url.pathname.endsWith('/submit')) {
        return this.handleSubmitAttempt(url.pathname.split('/')[3], body)
      }

      if (url.pathname === '/api/results' && request.method === 'GET') {
        return this.requireAdmin(request, () => this.handleResults(url.searchParams.get('examId')))
      }

      if (url.pathname.startsWith('/api/results/') && request.method === 'GET') {
        return this.requireAdmin(request, () => this.handleAttemptResult(url.pathname.split('/')[3]))
      }

      return jsonResponse({ error: 'not_found' }, 404)
    } catch (error) {
      return jsonResponse({ error: error.message || 'server_error' }, error.statusCode || 500)
    }
  }

  async ensureSeeded() {
    const exams = await this.state.storage.get('exams')
    if (!Array.isArray(exams) || exams.length === 0) {
      await this.state.storage.put('exams', buildSampleExams())
    }
    const attempts = await this.state.storage.get('attempts')
    if (!Array.isArray(attempts)) {
      await this.state.storage.put('attempts', [])
    }
  }

  async readExams() {
    const exams = await this.state.storage.get('exams')
    return Array.isArray(exams) ? exams : []
  }

  async writeExams(exams) {
    await this.state.storage.put('exams', exams)
  }

  async readAttempts() {
    const attempts = await this.state.storage.get('attempts')
    return Array.isArray(attempts) ? attempts : []
  }

  async writeAttempts(attempts) {
    await this.state.storage.put('attempts', attempts)
  }

  getAdminPassword() {
    return this.env.ADMIN_PASSWORD || 'TinHoc2026!'
  }

  getAuthToken(request) {
    const auth = request.headers.get('authorization') || ''
    const match = auth.match(/^Bearer\s+(.+)$/i)
    return match ? match[1] : ''
  }

  async getSession(request) {
    const token = this.getAuthToken(request)
    if (!token) return null
    const session = await this.state.storage.get(`admin-session:${token}`)
    if (!session) return null
    if (Date.now() > session.expiresAt) {
      await this.state.storage.delete(`admin-session:${token}`)
      return null
    }
    return session
  }

  async requireAdmin(request, handler) {
    const session = await this.getSession(request)
    if (!session) return jsonResponse({ error: 'admin_auth_required' }, 401)
    return handler(session)
  }

  async handleAdminLogin(body) {
    const password = String(body?.password || '')
    if (password !== this.getAdminPassword()) {
      return jsonResponse({ error: 'invalid_admin_password' }, 401)
    }
    const token = crypto.randomUUID()
    const session = { token, expiresAt: Date.now() + ADMIN_TOKEN_TTL_MS }
    await this.state.storage.put(`admin-session:${token}`, session)
    return jsonResponse(session)
  }

  async handleListExams(request) {
    const admin = await this.getSession(request)
    const exams = (await this.readExams())
      .filter(exam => admin || exam.status === 'published')
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .map(examMeta)
    return jsonResponse({ exams })
  }

  async handleGetExam(request, examId) {
    const exams = await this.readExams()
    const exam = exams.find(item => item.id === examId)
    assert(exam, 'exam_not_found', 404)
    const admin = await this.getSession(request)
    if (!admin && exam.status !== 'published') {
      return jsonResponse({ error: 'exam_not_found' }, 404)
    }
    return jsonResponse(admin ? sanitizeExamForAdmin(exam) : sanitizeExamForStudent(exam))
  }

  async handleCreateExam(body) {
    const exams = await this.readExams()
    const exam = normalizeExamPayload(body, exams)
    exams.unshift(exam)
    await this.writeExams(exams)
    return jsonResponse({ exam: sanitizeExamForAdmin(exam) }, 201)
  }

  async handleUpdateExam(examId, body) {
    const exams = await this.readExams()
    const existing = exams.find(item => item.id === examId)
    assert(existing, 'exam_not_found', 404)
    const nextExam = normalizeExamPayload({ ...body, id: examId, status: body?.status || existing.status }, exams, existing)
    const updated = exams.map(item => item.id === examId ? nextExam : item)
    await this.writeExams(updated)
    return jsonResponse({ exam: sanitizeExamForAdmin(nextExam) })
  }

  async handleDeleteExam(examId) {
    const exams = await this.readExams()
    const filtered = exams.filter(item => item.id !== examId)
    assert(filtered.length !== exams.length, 'exam_not_found', 404)
    await this.writeExams(filtered)
    return jsonResponse({ ok: true })
  }

  async handlePublishExam(examId, body) {
    const exams = await this.readExams()
    const existing = exams.find(item => item.id === examId)
    assert(existing, 'exam_not_found', 404)
    const nextStatus = body?.status === 'draft' ? 'draft' : 'published'
    const updatedExam = { ...existing, status: nextStatus, updatedAt: new Date().toISOString() }
    await this.writeExams(exams.map(item => item.id === examId ? updatedExam : item))
    return jsonResponse({ exam: sanitizeExamForAdmin(updatedExam) })
  }

  async handleImportExam(body) {
    return this.handleCreateExam(body)
  }

  async handleExportExam(examId) {
    const exam = (await this.readExams()).find(item => item.id === examId)
    assert(exam, 'exam_not_found', 404)
    return jsonResponse({ exam: sanitizeExamForAdmin(exam) })
  }

  async handleStartAttempt(body) {
    const exams = await this.readExams()
    const exam = exams.find(item => item.id === String(body?.examId || ''))
    assert(exam, 'exam_not_found', 404)
    assert(exam.status === 'published', 'exam_not_published', 400)
    const student = validateStudent(body?.student)
    const startedAt = new Date().toISOString()
    const attempt = {
      id: `attempt-${crypto.randomUUID()}`,
      examId: exam.id,
      examTitle: exam.title,
      student,
      startedAt,
      submittedAt: null,
      durationUsedSeconds: 0,
      status: 'in_progress',
      answers: {},
      score: null,
      summary: null,
      review: null,
      updatedAt: startedAt
    }
    const attempts = await this.readAttempts()
    attempts.unshift(attempt)
    await this.writeAttempts(attempts)
    return jsonResponse({
      attemptId: attempt.id,
      exam: sanitizeExamForStudent(exam),
      startedAt
    }, 201)
  }

  async handleSaveAttempt(attemptId, body) {
    const attempts = await this.readAttempts()
    const index = attempts.findIndex(item => item.id === attemptId)
    assert(index >= 0, 'attempt_not_found', 404)
    assert(attempts[index].status === 'in_progress', 'attempt_already_submitted', 400)
    attempts[index] = {
      ...attempts[index],
      answers: typeof body?.answers === 'object' && body.answers ? body.answers : attempts[index].answers,
      durationUsedSeconds: Number(body?.durationUsedSeconds) || attempts[index].durationUsedSeconds || 0,
      updatedAt: new Date().toISOString()
    }
    await this.writeAttempts(attempts)
    return jsonResponse({ ok: true, updatedAt: attempts[index].updatedAt })
  }

  async handleSubmitAttempt(attemptId, body) {
    const attempts = await this.readAttempts()
    const index = attempts.findIndex(item => item.id === attemptId)
    assert(index >= 0, 'attempt_not_found', 404)
    const stored = attempts[index]
    if (stored.status === 'submitted') {
      return jsonResponse({
        attemptId: stored.id,
        score: stored.score,
        summary: stored.summary,
        review: stored.review
      })
    }

    const exam = (await this.readExams()).find(item => item.id === stored.examId)
    assert(exam, 'exam_not_found', 404)
    const answers = typeof body?.answers === 'object' && body.answers ? body.answers : stored.answers
    const durationUsedSeconds = Number(body?.durationUsedSeconds) || stored.durationUsedSeconds || 0
    const result = evaluateAttempt(exam, answers, durationUsedSeconds)

    attempts[index] = {
      ...stored,
      answers,
      durationUsedSeconds,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
      score: result.score,
      summary: result.summary,
      review: result.review,
      updatedAt: new Date().toISOString()
    }
    await this.writeAttempts(attempts)

    return jsonResponse({
      attemptId: attempts[index].id,
      score: attempts[index].score,
      summary: attempts[index].summary,
      review: attempts[index].review
    })
  }

  async handleResults(examId) {
    const exam = (await this.readExams()).find(item => item.id === String(examId || ''))
    assert(exam, 'exam_not_found', 404)
    const stats = await summarizeResults(await this.readAttempts(), exam.id)
    return jsonResponse({ exam: examMeta(exam), stats })
  }

  async handleAttemptResult(attemptId) {
    const attempt = (await this.readAttempts()).find(item => item.id === attemptId)
    assert(attempt, 'attempt_not_found', 404)
    return jsonResponse({
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
  }
}

async function readBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return {}
  const raw = await request.text()
  if (!raw) return {}
  return JSON.parse(raw)
}

function assert(condition, message, statusCode = 400) {
  if (condition) return
  const error = new Error(message)
  error.statusCode = statusCode
  throw error
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
          choices: (question.choices || []).map(choice => ({ key: choice.key, text: choice.text }))
        }
      }
      return {
        id: question.id,
        type: question.type,
        text: question.text,
        statements: (question.statements || []).map(statement => ({ key: statement.key, text: statement.text }))
      }
    })
  }
}

function sanitizeExamForAdmin(exam) {
  return JSON.parse(JSON.stringify({ ...examMeta(exam), questions: exam.questions || [] }))
}

function normalizeExamPayload(payload, existingExams, existingExam = null) {
  const source = payload || {}
  const now = new Date().toISOString()
  const questions = Array.isArray(source.questions)
    ? source.questions.map((question, index) => normalizeQuestion(question, index))
    : []

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

  assert(exam.code, 'exam_code_required')
  assert(exam.title, 'exam_title_required')
  assert(exam.questions.length > 0, 'exam_questions_required')
  const duplicate = existingExams.find(item => item.code === exam.code && item.id !== exam.id)
  assert(!duplicate, 'exam_code_duplicated')
  return exam
}

function normalizeQuestion(question, index) {
  const base = {
    id: question?.id || `q-${crypto.randomUUID()}`,
    type: String(question?.type || '').trim(),
    text: String(question?.text || '').trim(),
    explanation: String(question?.explanation || '').trim()
  }

  assert(base.text, `question_${index + 1}_text_required`)
  assert(base.type === 'multiple_choice' || base.type === 'true_false_group', `question_${index + 1}_type_invalid`)

  if (base.type === 'multiple_choice') {
    const choices = Array.isArray(question?.choices)
      ? question.choices.map((choice, choiceIndex) => ({
          key: String(choice.key || String.fromCharCode(65 + choiceIndex)).trim().toUpperCase(),
          text: String(choice.text || '').trim(),
          correct: !!choice.correct
        }))
      : []
    assert(choices.length === 4, `question_${index + 1}_choices_invalid`)
    assert(choices.every(choice => choice.text), `question_${index + 1}_choice_text_required`)
    assert(choices.filter(choice => choice.correct).length === 1, `question_${index + 1}_must_have_one_correct_choice`)
    return { ...base, choices }
  }

  const statements = Array.isArray(question?.statements)
    ? question.statements.map((statement, statementIndex) => ({
        key: String(statement.key || String.fromCharCode(97 + statementIndex)).trim().toLowerCase(),
        text: String(statement.text || '').trim(),
        answer: !!statement.answer,
        explanation: String(statement.explanation || '').trim()
      }))
    : []
  assert(statements.length >= 2, `question_${index + 1}_statements_invalid`)
  assert(statements.every(statement => statement.text), `question_${index + 1}_statement_text_required`)
  return { ...base, statements }
}

function validateStudent(student) {
  const normalized = {
    name: String(student?.name || '').trim(),
    className: String(student?.className || '').trim(),
    studentCode: String(student?.studentCode || '').trim()
  }
  assert(normalized.name, 'student_name_required')
  assert(normalized.className, 'student_class_required')
  assert(normalized.studentCode, 'student_code_required')
  return normalized
}

function computeTotalPoints(questions) {
  return (questions || []).reduce((sum, question) => {
    return sum + (question.type === 'true_false_group' ? (question.statements || []).length : 1)
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

async function summarizeResults(attempts, examId) {
  const submitted = attempts.filter(item => item.examId === examId && item.status === 'submitted')
  const scores = submitted.map(item => Number(item.score) || 0)
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
    attemptCount: submitted.length,
    averageScore,
    highestScore,
    lowestScore,
    distribution,
    attempts: submitted
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

function buildSampleExams() {
  const now = new Date().toISOString()
  return [{
    id: 'exam-0501-worker',
    code: '0501-MAU',
    title: 'De on thi TNTHPT Tin hoc 0501',
    description: 'De mau de kiem thu he thong cloudflare worker. Giao vien co the chinh sua hoac import de moi bang JSON.',
    durationMinutes: 50,
    status: 'published',
    createdAt: now,
    updatedAt: now,
    questions: [
      {
        id: 'q-0501-1',
        type: 'multiple_choice',
        text: 'Trong mang may tinh, thiet bi nao dung de dinh tuyen goi tin giua cac mang?',
        explanation: 'Router la thiet bi thuc hien chuc nang dinh tuyen giua cac mang khac nhau.',
        choices: [
          { key: 'A', text: 'Switch', correct: false },
          { key: 'B', text: 'Router', correct: true },
          { key: 'C', text: 'Hub', correct: false },
          { key: 'D', text: 'Access Point', correct: false }
        ]
      },
      {
        id: 'q-0501-2',
        type: 'multiple_choice',
        text: 'The HTML nao bieu dien tieu de lon nhat tren trang?',
        explanation: 'Trong HTML, h1 la muc tieu de cao nhat.',
        choices: [
          { key: 'A', text: '<head>', correct: false },
          { key: 'B', text: '<title>', correct: false },
          { key: 'C', text: '<h1>', correct: true },
          { key: 'D', text: '<p>', correct: false }
        ]
      },
      {
        id: 'q-0501-3',
        type: 'true_false_group',
        text: 'Danh gia cac nhan dinh sau ve tri tue nhan tao:',
        explanation: 'AI yeu chi giai quyet tot cac nhiem vu chuyen biet; du lieu huan luyen anh huong manh den ket qua.',
        statements: [
          { key: 'a', text: 'AI tao sinh co the tao van ban hoac hinh anh tu du lieu da hoc.', answer: true, explanation: 'Day la nang luc dien hinh cua AI tao sinh.' },
          { key: 'b', text: 'AI manh hien da duoc trien khai pho bien trong truong hoc.', answer: false, explanation: 'AI manh theo nghia tu nhan thuc van chua ton tai thuc te.' }
        ]
      }
    ]
  }]
}
