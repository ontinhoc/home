const CONFIGURED_API_BASE = window.ONTHI_API_BASE || document.documentElement.dataset.apiBase || ''
const IS_LOCAL_FRONTEND = location.protocol === 'file:' || ['127.0.0.1', 'localhost'].includes(location.hostname)
const API_BASE = CONFIGURED_API_BASE || (IS_LOCAL_FRONTEND && location.port !== '3000' ? 'http://127.0.0.1:3000' : '')
const STUDENT_STORAGE_KEY = 'onthi-thpt-tinhoc-active-attempt'
const ADMIN_TOKEN_KEY = 'onthi-thpt-tinhoc-admin-token'

const state = {
  publishedExams: [],
  studentFilter: '',
  activeAttempt: null,
  currentQuestionIndex: 0,
  timerHandle: null,
  saveHandle: null,
  saveKick: null,
  isSubmitting: false,
  completedAttempt: null,
  adminToken: '',
  adminExams: [],
  adminFilter: '',
  editingExam: null,
  selectedStatsExamId: '',
  statsPayload: null
}

const $ = selector => document.querySelector(selector)
const $$ = selector => Array.from(document.querySelectorAll(selector))

const TEXT_FIXES = [
  ['B?t d?u lï¿½m bï¿½i', 'Bat dau lam bai'],
  ['N?p bï¿½i', 'Nop bai'],
  ['Lï¿½m d? khï¿½c', 'Lam de khac'],
  ['Quay v? danh sï¿½ch d?', 'Quay ve danh sach de'],
  ['Khï¿½ng t?i du?c danh sï¿½ch d?:', 'Khong tai duoc danh sach de:'],
  ['Khï¿½ng luu du?c ti?n d?:', 'Khong luu duoc tien do:'],
  ['Khï¿½ng n?p du?c bï¿½i:', 'Khong nop duoc bai:'],
  ['Khï¿½ng cï¿½ mï¿½ t? thï¿½m.', 'Khong co mo ta them.'],
  ['B?n ch?n:', 'Ban chon:'],
  ['Mï¿½ d?:', 'Ma de:'],
  ['Th?i luong', 'Thoi luong'],
  ['Th?i gian', 'Thoi gian'],
  ['Ti?n d?', 'Tien do'],
  ['Khï¿½ng', 'Khong'],
  ['Hï¿½y', 'Hay'],
  ['Mï¿½', 'Ma'],
  ['K?t qu?', 'Ket qua'],
  ['H?c sinh', 'Hoc sinh'],
  ['Giao viï¿½n', 'Giao vien'],
  ['giï¿½o viï¿½n', 'giao vien'],
  ['S?n sï¿½ng', 'San sang'],
  ['cï¿½u', 'cau'],
  ['Cï¿½u', 'Cau'],
  ['phï¿½t', 'phut'],
  ['Th?i', 'Thoi'],
  ['lu?ng', 'luong'],
  ['lu?t', 'luot'],
  ['bï¿½i', 'bai'],
  ['lï¿½m', 'lam'],
  ['ï¿½ï¿½ng', 'Dung'],
  ['ï¿½ï¿½ luu', 'Da luu'],
  ['ï¿½ang', 'Dang'],
  ['ï¿½i?m', 'Diem'],
  ['ï¿½ï¿½p ï¿½n', 'Dap an'],
  ['ï¿½ï¿½ tr?', 'Da tra'],
  ['ï¿½ï¿½ khï¿½i ph?c', 'Da khoi phuc'],
  ['ti?n d?', 'tien do'],
  ['Ti?n d?', 'Tien do'],
  ['Th?ng kï¿½', 'Thong ke'],
  ['S?a', 'Sua'],
  ['Xï¿½a', 'Xoa'],
  ['Lï¿½n', 'Len'],
  ['Xu?ng', 'Xuong'],
  ['ï¿½', ''],
  ['?i', 'oi'],
  ['?ng', 'ong'],
  ['?t', 'at'],
  ['?i', 'oi']
]

function fixBrokenVietnamese(text) {
  let next = String(text ?? '')
  for (const [bad, good] of TEXT_FIXES) {
    next = next.split(bad).join(good)
  }
  return next
}

function cleanupVisibleText(root = document) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const textNodes = []
  while (walker.nextNode()) textNodes.push(walker.currentNode)
  for (const node of textNodes) {
    const fixed = fixBrokenVietnamese(node.nodeValue)
    if (fixed !== node.nodeValue) node.nodeValue = fixed
  }
  root.querySelectorAll?.('input[placeholder], textarea[placeholder]').forEach(el => {
    const fixed = fixBrokenVietnamese(el.getAttribute('placeholder'))
    if (fixed !== el.getAttribute('placeholder')) el.setAttribute('placeholder', fixed)
  })
  const fixedTitle = fixBrokenVietnamese(document.title)
  if (fixedTitle !== document.title) document.title = fixedTitle
}

function showMessage(targetId, text, type = 'info') {
  const el = document.getElementById(targetId)
  if (!el) return
  el.textContent = text
  el.className = `message show ${type}`
}

function hideMessage(targetId) {
  const el = document.getElementById(targetId)
  if (!el) return
  el.textContent = ''
  el.className = 'message'
}

async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.error || data.message || `Request failed: ${response.status}`)
  return data
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(value) {
  if (!value) return 'Chua c�'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

function escapeHtml(text) {
  return String(text || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value))
}

function getStudentFormData() {
  return {
    name: $('#student-name').value.trim(),
    className: $('#student-class').value.trim(),
    studentCode: $('#student-code').value.trim()
  }
}

function validateStudentForm() {
  const student = getStudentFormData()
  if (!student.name || !student.className || !student.studentCode) {
    throw new Error('H�y nh?p d? h? t�n, l?p v� m� h?c sinh/SBD tru?c khi b?t d?u.')
  }
  return student
}

function showTab(name) {
  const studentActive = name === 'student'
  $('#student-view').classList.toggle('active', studentActive)
  $('#teacher-view').classList.toggle('active', !studentActive)
  $('#tab-student').classList.toggle('active', studentActive)
  $('#tab-teacher').classList.toggle('active', !studentActive)
  $('#tab-student').setAttribute('aria-selected', String(studentActive))
  $('#tab-teacher').setAttribute('aria-selected', String(!studentActive))
}

async function checkServerHealth() {
  $('#api-base-label').textContent = API_BASE || window.location.origin
  try {
    await apiFetch('/api/health')
    $('#server-status').textContent = 'S?n s�ng'
    $('#server-status').style.color = '#9bf6c7'
  } catch (error) {
    $('#server-status').textContent = 'Chua ket noi'
    $('#server-status').style.color = '#ffd6d6'
    showMessage('global-message', 'Kh�ng k?t n?i du?c t?i API. H�y ch?y `npm start` trong thu m?c `server/` r?i t?i l?i trang.', 'error')
  }
}

async function loadPublishedExams() {
  try {
    const data = await apiFetch('/api/exams')
    state.publishedExams = Array.isArray(data.exams) ? data.exams : []
    $('#published-count').textContent = String(state.publishedExams.length)
    renderPublishedExams()
  } catch (error) {
    renderPublishedExams()
    showMessage('student-message', `Kh�ng t?i du?c danh s�ch d?: ${error.message}`, 'error')
  }
}

function renderPublishedExams() {
  const container = $('#exam-list')
  const filter = state.studentFilter.toLowerCase()
  const exams = state.publishedExams.filter(exam => {
    const haystack = `${exam.code} ${exam.title} ${exam.description || ''}`.toLowerCase()
    return haystack.includes(filter)
  })

  container.innerHTML = exams.map(exam => `
    <article class="exam-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(exam.code)}</span>
        <span class="badge navy">${exam.questionCount} c�u</span>
        <span class="badge success">${exam.totalPoints} diem toi da</span>
      </div>
      <h3>${escapeHtml(exam.title)}</h3>
      <p>${escapeHtml(exam.description || 'Kh�ng c� m� t? th�m.')}</p>
      <div class="progress-row" style="margin-top:14px">
        <span>Thoi luong</span>
        <strong>${exam.durationMinutes} ph�t</strong>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn btn-primary" data-start-exam="${exam.id}">B?t d?u l�m b�i</button>
      </div>
    </article>
  `).join('')

  $('#exam-empty').classList.toggle('show', exams.length === 0)
  $$('[data-start-exam]').forEach(button => {
    button.addEventListener('click', () => startExam(button.getAttribute('data-start-exam')))
  })
  cleanupVisibleText(container)
}

function totalUnitsCount() {
  const attempt = state.activeAttempt
  if (!attempt) return 0
  return (attempt.exam.questions || []).reduce((sum, question) => {
    return sum + (question.type === 'true_false_group' ? (question.statements || []).length : 1)
  }, 0)
}

function answeredUnitsCount() {
  const attempt = state.activeAttempt
  if (!attempt) return 0
  return (attempt.exam.questions || []).reduce((sum, question) => {
    if (question.type === 'multiple_choice') return sum + (attempt.answers[question.id] ? 1 : 0)
    const group = attempt.answers[question.id] || {}
    return sum + (question.statements || []).filter(statement => group[statement.key] === true || group[statement.key] === false).length
  }, 0)
}

function persistStudentAttempt() {
  if (!state.activeAttempt) return
  localStorage.setItem(STUDENT_STORAGE_KEY, JSON.stringify(state.activeAttempt))
}

function clearStudentAttempt() {
  localStorage.removeItem(STUDENT_STORAGE_KEY)
}

function getRemainingSeconds() {
  if (!state.activeAttempt) return 0
  return Math.max(0, Math.floor((state.activeAttempt.deadline - Date.now()) / 1000))
}

function getDurationUsedSeconds() {
  if (!state.activeAttempt) return 0
  const started = new Date(state.activeAttempt.startedAt).getTime()
  return Math.max(0, Math.floor((Date.now() - started) / 1000))
}

function renderAnswerProgress() {
  const answered = answeredUnitsCount()
  const total = totalUnitsCount()
  $('#answered-summary').textContent = `${answered}/${total}`
  $('#answer-progress').style.width = `${total ? (answered / total) * 100 : 0}%`
  $('#active-progress-meta').textContent = `�� tr? l?i ${answered}/${total} �`
}

function renderSaveStatus() {
  $('#save-status').textContent = state.activeAttempt?.lastSavedAt
    ? `�� luu l�c ${formatDateTime(state.activeAttempt.lastSavedAt)}`
    : 'Chua luu l�n server'
}

function renderQuestionNav() {
  const attempt = state.activeAttempt
  if (!attempt) return
  $('#question-nav').innerHTML = attempt.exam.questions.map((question, index) => {
    const answered = question.type === 'multiple_choice'
      ? !!attempt.answers[question.id]
      : (question.statements || []).every(statement => {
          const group = attempt.answers[question.id] || {}
          return group[statement.key] === true || group[statement.key] === false
        })
    const classes = ['nav-item']
    if (index === state.currentQuestionIndex) classes.push('current')
    if (answered) classes.push('answered')
    return `<button class="${classes.join(' ')}" type="button" data-jump-question="${index}">${index + 1}</button>`
  }).join('')

  $$('[data-jump-question]').forEach(button => {
    button.addEventListener('click', () => {
      state.currentQuestionIndex = Number(button.dataset.jumpQuestion) || 0
      renderQuestion()
      renderQuestionNav()
    })
  })
}

function renderQuestion() {
  const attempt = state.activeAttempt
  if (!attempt) return
  const question = attempt.exam.questions[state.currentQuestionIndex]
  $('#question-number').textContent = `C�u ${state.currentQuestionIndex + 1} / ${attempt.exam.questions.length}`
  $('#question-text').textContent = question.text
  const zone = $('#question-answer-zone')

  if (question.type === 'multiple_choice') {
    const selected = attempt.answers[question.id] || ''
    zone.innerHTML = `
      <div class="choice-list">
        ${(question.choices || []).map(choice => `
          <label class="choice ${selected === choice.key ? 'active' : ''}">
            <input type="radio" name="mc-choice" value="${escapeHtml(choice.key)}" ${selected === choice.key ? 'checked' : ''}>
            <span class="choice-key">${escapeHtml(choice.key)}</span>
            <span>${escapeHtml(choice.text)}</span>
          </label>
        `).join('')}
      </div>
    `
    $$('input[name="mc-choice"]').forEach(input => {
      input.addEventListener('change', () => {
        attempt.answers[question.id] = input.value
        onAnswerChanged()
      })
    })
  } else {
    const group = attempt.answers[question.id] || {}
    zone.innerHTML = `
      <div class="statement-list">
        ${(question.statements || []).map(statement => `
          <div class="statement">
            <div class="statement-top">
              <div><strong>${escapeHtml(statement.key.toUpperCase())}.</strong> ${escapeHtml(statement.text)}</div>
              <div class="statement-toggle">
                <button type="button" class="${group[statement.key] === true ? 'active true' : ''}" data-tf-key="${statement.key}" data-tf-value="true">��ng</button>
                <button type="button" class="${group[statement.key] === false ? 'active false' : ''}" data-tf-key="${statement.key}" data-tf-value="false">Sai</button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    `
    $$('[data-tf-key]').forEach(button => {
      button.addEventListener('click', () => {
        const key = button.dataset.tfKey
        const value = button.dataset.tfValue === 'true'
        if (!attempt.answers[question.id] || typeof attempt.answers[question.id] !== 'object') {
          attempt.answers[question.id] = {}
        }
        attempt.answers[question.id][key] = value
        onAnswerChanged()
      })
    })
  }

  $('#prev-question').disabled = state.currentQuestionIndex === 0
  $('#next-question').disabled = state.currentQuestionIndex === attempt.exam.questions.length - 1
  cleanupVisibleText($('#exam-stage'))
}

function renderActiveAttempt() {
  const attempt = state.activeAttempt
  if (!attempt) return
  $('#active-exam-code').textContent = `M� d?: ${attempt.exam.code}`
  $('#active-exam-title').textContent = attempt.exam.title
  $('#active-student-meta').textContent = `${attempt.student.name} � ${attempt.student.className} � ${attempt.student.studentCode}`
  renderQuestion()
  renderQuestionNav()
  renderAnswerProgress()
  renderSaveStatus()
  cleanupVisibleText($('#exam-stage'))
}

function updateTimer() {
  const remaining = getRemainingSeconds()
  const el = $('#timer-value')
  el.textContent = formatDuration(remaining)
  el.classList.toggle('danger', remaining <= 300)
}

function stopTimer() {
  if (state.timerHandle) clearInterval(state.timerHandle)
  state.timerHandle = null
}

function startTimer() {
  stopTimer()
  updateTimer()
  state.timerHandle = setInterval(() => {
    updateTimer()
    if (getRemainingSeconds() <= 0) submitExam(true)
  }, 1000)
}

function stopAutosaveLoop() {
  if (state.saveHandle) clearInterval(state.saveHandle)
  state.saveHandle = null
  if (state.saveKick) clearTimeout(state.saveKick)
  state.saveKick = null
}

function startAutosaveLoop() {
  stopAutosaveLoop()
  state.saveHandle = setInterval(() => saveProgress({ silent: true }), 20000)
}

async function startExam(examId) {
  hideMessage('student-message')
  try {
    const student = validateStudentForm()
    const payload = await apiFetch('/api/attempts/start', {
      method: 'POST',
      body: JSON.stringify({ examId, student })
    })
    state.activeAttempt = {
      attemptId: payload.attemptId,
      exam: payload.exam,
      student,
      answers: {},
      startedAt: payload.startedAt,
      deadline: new Date(payload.startedAt).getTime() + 50 * 60 * 1000,
      lastSavedAt: null
    }
    state.currentQuestionIndex = 0
    persistStudentAttempt()
    startAutosaveLoop()
    $('#exam-stage').classList.add('active')
    $('#result-stage').classList.remove('active')
    renderActiveAttempt()
    startTimer()
  } catch (error) {
    showMessage('student-message', error.message, 'error')
  }
}

function onAnswerChanged() {
  persistStudentAttempt()
  renderQuestion()
  renderQuestionNav()
  renderAnswerProgress()
  if (state.saveKick) clearTimeout(state.saveKick)
  state.saveKick = setTimeout(() => saveProgress({ silent: true }), 500)
}

async function saveProgress({ silent = true } = {}) {
  const attempt = state.activeAttempt
  if (!attempt) return
  try {
    $('#autosave-note').textContent = '�ang luu tiAn de...'
    await apiFetch(`/api/attempts/${attempt.attemptId}/save`, {
      method: 'PUT',
      body: JSON.stringify({
        answers: attempt.answers,
        durationUsedSeconds: getDurationUsedSeconds()
      })
    })
    attempt.lastSavedAt = new Date().toISOString()
    persistStudentAttempt()
    renderSaveStatus()
    $('#autosave-note').textContent = 'TiAn de d� du?c d?ng b? v?i server.'
    if (!silent) showMessage('student-message', '�� luu tiAn de hi?n t?i.', 'success')
  } catch (error) {
    $('#autosave-note').textContent = `Luu that bai: ${error.message}`
    if (!silent) showMessage('student-message', `Kh�ng luu du?c tiAn de: ${error.message}`, 'error')
  }
}

async function submitExam(forceAuto = false) {
  const attempt = state.activeAttempt
  if (!attempt || state.isSubmitting) return
  try {
    state.isSubmitting = true
    $('#submit-exam').disabled = true
    await saveProgress({ silent: true })
    const payload = await apiFetch(`/api/attempts/${attempt.attemptId}/submit`, {
      method: 'POST',
      body: JSON.stringify({
        answers: attempt.answers,
        durationUsedSeconds: getDurationUsedSeconds()
      })
    })
    stopTimer()
    stopAutosaveLoop()
    clearStudentAttempt()
    $('#exam-stage').classList.remove('active')
    renderResult(payload, deepClone(attempt))
    state.activeAttempt = null
    if (forceAuto) showMessage('student-message', 'H?t 50 ph�t, h? th?ng d� t? n?p b�i.', 'warning')
    else showMessage('student-message', 'N?p b�i th�nh c�ng.', 'success')
  } catch (error) {
    $('#submit-exam').disabled = false
    showMessage('student-message', `Kh�ng n?p du?c b�i: ${error.message}`, 'error')
  } finally {
    state.isSubmitting = false
  }
}

function renderResult(payload, attempt) {
  state.completedAttempt = attempt || null
  $('#result-stage').classList.add('active')
  $('#result-exam-badge').textContent = attempt ? `M� d?: ${attempt.exam.code}` : 'Ket qua'
  $('#result-student-badge').textContent = attempt ? `${attempt.student.name} � ${attempt.student.className}` : 'Hoc sinh'
  const summary = payload.summary || {}
  const cards = [
    { label: '�i?m thang 10', value: payload.score ?? 0 },
    { label: '��ng / T?ng', value: `${summary.correctCount ?? 0}/${summary.totalPoints ?? 0}` },
    { label: 'T? l? ho�n th�nh', value: `${summary.completionRate ?? 0}%` },
    { label: 'Th?i gian d�ng', value: formatDuration(summary.durationUsedSeconds ?? 0) }
  ]
  $('#result-metrics').innerHTML = cards.map(card => `
    <div class="result-card">
      <span>${escapeHtml(card.label)}</span>
      <strong>${escapeHtml(card.value)}</strong>
    </div>
  `).join('')

  $('#review-list').innerHTML = (payload.review || []).map((item, index) => {
    if (item.type === 'multiple_choice') {
      return `
        <article class="question-card">
          <div class="badge-row">
            <span class="badge">C�u ${index + 1}</span>
            <span class="badge ${item.isCorrect ? 'success' : 'warning'}">${item.isCorrect ? '��ng' : 'Sai'}</span>
          </div>
          <h3>${escapeHtml(item.text)}</h3>
          <div class="choice-list">
            ${(item.choices || []).map(choice => {
              let cls = ''
              if (choice.correct) cls = 'correct'
              if (item.submittedAnswer === choice.key && !choice.correct) cls = 'wrong'
              return `<div class="review-choice ${cls}"><strong>${escapeHtml(choice.key)}.</strong> ${escapeHtml(choice.text)}</div>`
            }).join('')}
          </div>
          <div class="review-explanation">
            Ban chon: <strong>${escapeHtml(item.submittedAnswer || 'Chua tra loi')}</strong><br>
            ��p �n d�ng: <strong>${escapeHtml(item.correctAnswer || 'Chua x�c d?nh')}</strong><br>
            ${escapeHtml(item.explanation || 'Kh�ng c� l?i gi?i b? sung.')}
          </div>
        </article>
      `
    }
    return `
      <article class="question-card">
        <div class="badge-row">
          <span class="badge">C�u ${index + 1}</span>
          <span class="badge navy">��ng/Sai</span>
        </div>
        <h3>${escapeHtml(item.text)}</h3>
        <div class="statement-list">
          ${(item.statements || []).map(statement => `
            <div class="review-statement ${statement.isCorrect ? 'correct' : statement.isAnswered ? 'wrong' : ''}">
              <strong>${escapeHtml(statement.key.toUpperCase())}.</strong> ${escapeHtml(statement.text)}<br>
              Ban chon: <strong>${statement.submittedAnswer === null ? 'Chua tra loi' : (statement.submittedAnswer ? '��ng' : 'Sai')}</strong><br>
              ��p �n d�ng: <strong>${statement.correctAnswer ? '��ng' : 'Sai'}</strong>
              <div class="review-explanation">${escapeHtml(statement.explanation || '')}</div>
            </div>
          `).join('')}
        </div>
        ${item.explanation ? `<div class="review-explanation">${escapeHtml(item.explanation)}</div>` : ''}
      </article>
    `
  }).join('')
  cleanupVisibleText($('#result-stage'))
}

function resetStudentStage() {
  state.activeAttempt = null
  state.completedAttempt = null
  state.currentQuestionIndex = 0
  state.isSubmitting = false
  stopTimer()
  stopAutosaveLoop()
  $('#exam-stage').classList.remove('active')
  $('#result-stage').classList.remove('active')
  clearStudentAttempt()
}

async function restoreStudentAttempt() {
  const raw = localStorage.getItem(STUDENT_STORAGE_KEY)
  if (!raw) return
  try {
    const parsed = JSON.parse(raw)
    if (!parsed?.attemptId || !parsed?.exam || !parsed?.student) {
      clearStudentAttempt()
      return
    }
    state.activeAttempt = parsed
    $('#student-name').value = parsed.student.name || ''
    $('#student-class').value = parsed.student.className || ''
    $('#student-code').value = parsed.student.studentCode || ''
    if (getRemainingSeconds() <= 0) {
      await submitExam(true)
      return
    }
    showMessage('student-message', '�� kh�i ph?c lu?t l�m b�i dang dang d? t? tr�nh duy?t n�y.', 'info')
    $('#exam-stage').classList.add('active')
    $('#result-stage').classList.remove('active')
    renderActiveAttempt()
    startAutosaveLoop()
    startTimer()
  } catch (error) {
    clearStudentAttempt()
  }
}

function blankExam() {
  return { id: '', code: '', title: '', description: '', status: 'draft', questions: [] }
}

function blankMultipleChoice() {
  return {
    id: `q-${crypto.randomUUID()}`,
    type: 'multiple_choice',
    text: '',
    explanation: '',
    choices: [
      { key: 'A', text: '', correct: true },
      { key: 'B', text: '', correct: false },
      { key: 'C', text: '', correct: false },
      { key: 'D', text: '', correct: false }
    ]
  }
}

function blankTrueFalse() {
  return {
    id: `q-${crypto.randomUUID()}`,
    type: 'true_false_group',
    text: '',
    explanation: '',
    statements: [
      { key: 'a', text: '', answer: true, explanation: '' },
      { key: 'b', text: '', answer: false, explanation: '' }
    ]
  }
}

function renderExamEditor() {
  const exam = state.editingExam || blankExam()
  $('#exam-code').value = exam.code || ''
  $('#exam-title').value = exam.title || ''
  $('#exam-description').value = exam.description || ''
  $('#exam-status').value = exam.status || 'draft'
  $('#question-count-badge').textContent = `${(exam.questions || []).length} c�u h?i`
  $('#question-editor-list').innerHTML = (exam.questions || []).map((question, index) => {
    if (question.type === 'multiple_choice') {
      return `
        <article class="question-card">
          <div class="badge-row">
            <span class="badge">C�u ${index + 1}</span>
            <span class="badge navy">4 lua chon</span>
          </div>
          <div class="toolbar">
            <button class="btn btn-soft" data-move-up="${index}">L�n</button>
            <button class="btn btn-soft" data-move-down="${index}">Xuong</button>
            <button class="btn btn-danger" data-remove-question="${index}">X�a</button>
          </div>
          <div class="field"><label>N?i dung c�u h?i</label><textarea data-field="question-text" data-index="${index}">${escapeHtml(question.text)}</textarea></div>
          <div class="field"><label>Loi giai ngan</label><textarea data-field="question-explanation" data-index="${index}">${escapeHtml(question.explanation || '')}</textarea></div>
          <div class="choice-editor">
            ${(question.choices || []).map((choice, choiceIndex) => `
              <div class="mini-grid">
                <input type="text" value="${escapeHtml(choice.key)}" data-choice-key="${index}-${choiceIndex}" placeholder="A">
                <input type="text" value="${escapeHtml(choice.text)}" data-choice-text="${index}-${choiceIndex}" placeholder="N?i dung d�p �n">
                <select data-choice-correct="${index}-${choiceIndex}">
                  <option value="false" ${choice.correct ? '' : 'selected'}>Sai</option>
                  <option value="true" ${choice.correct ? 'selected' : ''}>��ng</option>
                </select>
              </div>
            `).join('')}
          </div>
        </article>
      `
    }
    return `
      <article class="question-card">
        <div class="badge-row">
          <span class="badge">C�u ${index + 1}</span>
          <span class="badge navy">��ng / Sai</span>
        </div>
        <div class="toolbar">
          <button class="btn btn-soft" data-move-up="${index}">L�n</button>
          <button class="btn btn-soft" data-move-down="${index}">Xuong</button>
          <button class="btn btn-danger" data-remove-question="${index}">X�a</button>
        </div>
        <div class="field"><label>N?i dung c�u h?i</label><textarea data-field="question-text" data-index="${index}">${escapeHtml(question.text)}</textarea></div>
        <div class="field"><label>Gi?i th�ch chung</label><textarea data-field="question-explanation" data-index="${index}">${escapeHtml(question.explanation || '')}</textarea></div>
        <div class="statement-editor">
          ${(question.statements || []).map((statement, statementIndex) => `
            <div class="mini-grid tf">
              <input type="text" value="${escapeHtml(statement.key)}" data-statement-key="${index}-${statementIndex}" placeholder="a">
              <input type="text" value="${escapeHtml(statement.text)}" data-statement-text="${index}-${statementIndex}" placeholder="Nhan dinh">
              <select data-statement-answer="${index}-${statementIndex}">
                <option value="true" ${statement.answer ? 'selected' : ''}>��ng</option>
                <option value="false" ${statement.answer ? '' : 'selected'}>Sai</option>
              </select>
              <button class="btn btn-danger" data-remove-statement="${index}-${statementIndex}">X�a �</button>
              <textarea data-statement-explanation="${index}-${statementIndex}" placeholder="Gi?i th�ch cho nhAn denh" style="grid-column:1 / -1; min-height:80px">${escapeHtml(statement.explanation || '')}</textarea>
            </div>
          `).join('')}
        </div>
        <div class="toolbar"><button class="btn btn-soft" data-add-statement="${index}">Th�m nhAn denh</button></div>
      </article>
    `
  }).join('')
  bindEditorInputs()
  cleanupVisibleText($('#teacher-view'))
}

function moveQuestion(index, delta) {
  const nextIndex = index + delta
  if (!state.editingExam || nextIndex < 0 || nextIndex >= state.editingExam.questions.length) return
  const [item] = state.editingExam.questions.splice(index, 1)
  state.editingExam.questions.splice(nextIndex, 0, item)
  renderExamEditor()
}

function bindEditorInputs() {
  $$('[data-field="question-text"]').forEach(input => input.addEventListener('input', () => {
    state.editingExam.questions[Number(input.dataset.index)].text = input.value
  }))
  $$('[data-field="question-explanation"]').forEach(input => input.addEventListener('input', () => {
    state.editingExam.questions[Number(input.dataset.index)].explanation = input.value
  }))
  $$('[data-choice-key]').forEach(input => input.addEventListener('input', () => {
    const [questionIndex, choiceIndex] = input.dataset.choiceKey.split('-').map(Number)
    state.editingExam.questions[questionIndex].choices[choiceIndex].key = input.value.toUpperCase()
  }))
  $$('[data-choice-text]').forEach(input => input.addEventListener('input', () => {
    const [questionIndex, choiceIndex] = input.dataset.choiceText.split('-').map(Number)
    state.editingExam.questions[questionIndex].choices[choiceIndex].text = input.value
  }))
  $$('[data-choice-correct]').forEach(select => select.addEventListener('change', () => {
    const [questionIndex, choiceIndex] = select.dataset.choiceCorrect.split('-').map(Number)
    state.editingExam.questions[questionIndex].choices.forEach((choice, idx) => { choice.correct = idx === choiceIndex ? select.value === 'true' : false })
    renderExamEditor()
  }))
  $$('[data-statement-key]').forEach(input => input.addEventListener('input', () => {
    const [questionIndex, statementIndex] = input.dataset.statementKey.split('-').map(Number)
    state.editingExam.questions[questionIndex].statements[statementIndex].key = input.value.toLowerCase()
  }))
  $$('[data-statement-text]').forEach(input => input.addEventListener('input', () => {
    const [questionIndex, statementIndex] = input.dataset.statementText.split('-').map(Number)
    state.editingExam.questions[questionIndex].statements[statementIndex].text = input.value
  }))
  $$('[data-statement-answer]').forEach(select => select.addEventListener('change', () => {
    const [questionIndex, statementIndex] = select.dataset.statementAnswer.split('-').map(Number)
    state.editingExam.questions[questionIndex].statements[statementIndex].answer = select.value === 'true'
  }))
  $$('[data-statement-explanation]').forEach(textarea => textarea.addEventListener('input', () => {
    const [questionIndex, statementIndex] = textarea.dataset.statementExplanation.split('-').map(Number)
    state.editingExam.questions[questionIndex].statements[statementIndex].explanation = textarea.value
  }))
  $$('[data-remove-question]').forEach(button => button.addEventListener('click', () => {
    state.editingExam.questions.splice(Number(button.dataset.removeQuestion), 1)
    renderExamEditor()
  }))
  $$('[data-move-up]').forEach(button => button.addEventListener('click', () => moveQuestion(Number(button.dataset.moveUp), -1)))
  $$('[data-move-down]').forEach(button => button.addEventListener('click', () => moveQuestion(Number(button.dataset.moveDown), 1)))
  $$('[data-add-statement]').forEach(button => button.addEventListener('click', () => {
    const question = state.editingExam.questions[Number(button.dataset.addStatement)]
    const nextKey = String.fromCharCode(97 + question.statements.length)
    question.statements.push({ key: nextKey, text: '', answer: true, explanation: '' })
    renderExamEditor()
  }))
  $$('[data-remove-statement]').forEach(button => button.addEventListener('click', () => {
    const [questionIndex, statementIndex] = button.dataset.removeStatement.split('-').map(Number)
    state.editingExam.questions[questionIndex].statements.splice(statementIndex, 1)
    renderExamEditor()
  }))
}

function collectEditingExam() {
  if (!state.editingExam) state.editingExam = blankExam()
  state.editingExam.code = $('#exam-code').value.trim()
  state.editingExam.title = $('#exam-title').value.trim()
  state.editingExam.description = $('#exam-description').value.trim()
  state.editingExam.status = $('#exam-status').value
  return state.editingExam
}

function renderAdminExams() {
  const filter = state.adminFilter.toLowerCase()
  const list = state.adminExams.filter(exam => `${exam.code} ${exam.title} ${exam.description || ''}`.toLowerCase().includes(filter))
  $('#admin-exam-list').innerHTML = list.map(exam => `
    <article class="admin-exam ${state.editingExam?.id === exam.id ? 'active' : ''}">
      <div class="badge-row">
        <span class="badge">${escapeHtml(exam.code)}</span>
        <span class="badge ${exam.status === 'published' ? 'success' : 'warning'}">${exam.status === 'published' ? 'Published' : 'Draft'}</span>
      </div>
      <h4>${escapeHtml(exam.title)}</h4>
      <p>${escapeHtml(exam.description || 'Kh�ng c� m� t?')}</p>
      <div class="note">S? c�u: ${exam.questionCount} � Cap nhat: ${formatDateTime(exam.updatedAt)}</div>
      <div class="toolbar">
        <button class="btn btn-soft" data-edit-exam="${exam.id}">Sua</button>
        <button class="btn btn-soft" data-stats-exam="${exam.id}">Th?ng k�</button>
        <button class="btn btn-soft" data-export-exam="${exam.id}">Xuat JSON</button>
        <button class="btn ${exam.status === 'published' ? 'btn-soft' : 'btn-primary'}" data-toggle-publish="${exam.id}" data-next-status="${exam.status === 'published' ? 'draft' : 'published'}">${exam.status === 'published' ? 'An de' : 'Publish'}</button>
        <button class="btn btn-danger" data-delete-exam="${exam.id}">X�a</button>
      </div>
    </article>
  `).join('')

  $$('[data-edit-exam]').forEach(button => button.addEventListener('click', () => editExam(button.dataset.editExam)))
  $$('[data-stats-exam]').forEach(button => button.addEventListener('click', () => {
    $('#stats-exam-select').value = button.dataset.statsExam
    loadStats()
  }))
  $$('[data-export-exam]').forEach(button => button.addEventListener('click', () => exportExamJson(button.dataset.exportExam)))
  $$('[data-toggle-publish]').forEach(button => button.addEventListener('click', () => setPublishState(button.dataset.togglePublish, button.dataset.nextStatus)))
  $$('[data-delete-exam]').forEach(button => button.addEventListener('click', () => deleteExam(button.dataset.deleteExam)))
  cleanupVisibleText($('#teacher-view'))
}

function updateStatsExamOptions(preferredId = '') {
  const selected = preferredId || state.selectedStatsExamId || state.adminExams[0]?.id || ''
  state.selectedStatsExamId = selected
  $('#stats-exam-select').innerHTML = state.adminExams.map(exam => `
    <option value="${exam.id}" ${selected === exam.id ? 'selected' : ''}>${escapeHtml(exam.code)} - ${escapeHtml(exam.title)}</option>
  `).join('') || '<option value="">Chua c� d?</option>'
}

async function loadAdminExams() {
  try {
    const data = await apiFetch('/api/exams')
    state.adminExams = Array.isArray(data.exams) ? data.exams : []
    renderAdminExams()
    updateStatsExamOptions(state.editingExam?.id || state.selectedStatsExamId)
    if (state.editingExam?.id) {
      await editExam(state.editingExam.id)
    } else if (!state.editingExam && state.adminExams[0]) {
      await editExam(state.adminExams[0].id)
    }
  } catch (error) {
    showMessage('admin-message', `Kh�ng t?i du?c danh s�ch d?: ${error.message}`, 'error')
  }
}

async function editExam(examId) {
  try {
    state.editingExam = await apiFetch(`/api/exams/${examId}`)
    renderAdminExams()
    updateStatsExamOptions(examId)
    renderExamEditor()
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function saveEditingExam({ publish = false } = {}) {
  try {
    const exam = deepClone(collectEditingExam())
    if (publish) exam.status = 'published'
    const method = exam.id ? 'PUT' : 'POST'
    const path = exam.id ? `/api/exams/${exam.id}` : '/api/exams'
    const payload = await apiFetch(path, { method, body: JSON.stringify(exam) })
    state.editingExam = payload.exam
    showMessage('admin-message', `�� luu d? ${payload.exam.code} th�nh c�ng.`, 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function setPublishState(examId, status) {
  try {
    await apiFetch(`/api/exams/${examId}/publish`, { method: 'POST', body: JSON.stringify({ status }) })
    showMessage('admin-message', status === 'published' ? '�? d� du?c publish.' : '�? d� chuy?n v? tr?ng th�i nh�p.', 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function deleteExam(examId) {
  if (!confirm('X�a d? n�y? H�nh d?ng n�y kh�ng ho�n t�c du?c.')) return
  try {
    await apiFetch(`/api/exams/${examId}`, { method: 'DELETE' })
    if (state.editingExam?.id === examId) state.editingExam = null
    renderExamEditor()
    showMessage('admin-message', '�� x�a d? thi.', 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function exportExamJson(examId) {
  try {
    const payload = await apiFetch(`/api/exams/${examId}/export`)
    const json = JSON.stringify(payload.exam, null, 2)
    $('#import-json').value = json
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${payload.exam.code || 'exam'}.json`
    link.click()
    URL.revokeObjectURL(url)
    showMessage('admin-message', '�� xu?t JSON c?a d? dang ch?n.', 'success')
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function importExamJson() {
  try {
    const raw = $('#import-json').value.trim()
    if (!raw) throw new Error('H�y d�n JSON d? thi tru?c khi import.')
    await apiFetch('/api/exams/import', { method: 'POST', body: raw })
    $('#import-json').value = ''
    showMessage('admin-message', 'Import d? t? JSON th�nh c�ng.', 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', `Import th?t b?i: ${error.message}`, 'error')
  }
}

function renderStats() {
  const payload = state.statsPayload
  if (!payload?.stats) return
  const stats = payload.stats
  const cards = [
    { label: 'S? lu?t l�m', value: stats.attemptCount },
    { label: '�i?m trung b�nh', value: stats.averageScore },
    { label: '�i?m cao nh?t', value: stats.highestScore },
    { label: '�i?m th?p nh?t', value: stats.lowestScore }
  ]
  $('#stats-metrics').innerHTML = cards.map(card => `<div class="stat-card"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></div>`).join('')
  $('#distribution-box').innerHTML = `<strong>Ph�n b? di?m:</strong><br>Du?i 5: ${stats.distribution.below5} lu?t<br>T? 5 d?n du?i 7: ${stats.distribution.from5to7} lu?t<br>T? 7 d?n du?i 8.5: ${stats.distribution.from7to8_5} lu?t<br>T? 8.5 d?n 10: ${stats.distribution.from8_5to10} lu?t`
  $('#stats-table-body').innerHTML = stats.attempts.map(item => `
    <tr>
      <td>${escapeHtml(item.student.name)}</td>
      <td>${escapeHtml(item.student.className)}</td>
      <td>${escapeHtml(item.student.studentCode)}</td>
      <td>${escapeHtml(item.score)}</td>
      <td>${escapeHtml(`${item.summary.correctCount}/${item.summary.totalPoints}`)}</td>
      <td>${escapeHtml(formatDuration(item.summary.durationUsedSeconds || 0))}</td>
      <td>${escapeHtml(formatDateTime(item.submittedAt))}</td>
      <td><button class="btn btn-soft" data-attempt-detail="${item.id}">Xem</button></td>
    </tr>
  `).join('')
  $$('[data-attempt-detail]').forEach(button => button.addEventListener('click', () => loadAttemptDetail(button.dataset.attemptDetail)))
  cleanupVisibleText($('#teacher-view'))
}

async function loadStats() {
  const examId = $('#stats-exam-select').value
  if (!examId) return
  try {
    state.selectedStatsExamId = examId
    state.statsPayload = await apiFetch(`/api/results?examId=${encodeURIComponent(examId)}`)
    renderStats()
  } catch (error) {
    showMessage('admin-message', `Kh�ng t?i du?c th?ng k�: ${error.message}`, 'error')
  }
}

async function loadAttemptDetail(attemptId) {
  try {
    const payload = await apiFetch(`/api/results/${attemptId}`)
    $('#attempt-detail').innerHTML = `
      <article class="attempt-card">
        <h4>${escapeHtml(payload.student.name)} � ${escapeHtml(payload.examTitle)}</h4>
        <p>�i?m: <strong>${escapeHtml(payload.score)}</strong> � N?p l�c ${escapeHtml(formatDateTime(payload.submittedAt))}</p>
        <p>L�m trong ${escapeHtml(formatDuration(payload.summary.durationUsedSeconds || 0))} � ��ng ${escapeHtml(payload.summary.correctCount)}/${escapeHtml(payload.summary.totalPoints)}</p>
      </article>
      ${(payload.review || []).map((item, index) => `
        <article class="question-card">
          <div class="badge-row"><span class="badge">C�u ${index + 1}</span><span class="badge navy">${escapeHtml(item.type)}</span></div>
          <h3>${escapeHtml(item.text)}</h3>
          ${item.type === 'multiple_choice'
            ? (item.choices || []).map(choice => `<div class="review-choice ${choice.correct ? 'correct' : (item.submittedAnswer === choice.key ? 'wrong' : '')}"><strong>${escapeHtml(choice.key)}.</strong> ${escapeHtml(choice.text)}</div>`).join('')
            : (item.statements || []).map(statement => `<div class="review-statement ${statement.isCorrect ? 'correct' : statement.isAnswered ? 'wrong' : ''}"><strong>${escapeHtml(statement.key.toUpperCase())}.</strong> ${escapeHtml(statement.text)}<br>Ban chon: ${statement.submittedAnswer === null ? 'Chua tra loi' : (statement.submittedAnswer ? '��ng' : 'Sai')}<br>��p �n: ${statement.correctAnswer ? '��ng' : 'Sai'}</div>`).join('')
          }
        </article>
      `).join('')}
    `
    cleanupVisibleText($('#teacher-view'))
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function adminLogin() {
  try {
    const password = $('#admin-password').value
    if (!password) throw new Error('H�y nh?p m?t kh?u admin.')
    const payload = await apiFetch('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) })
    state.adminToken = payload.token
    localStorage.setItem(ADMIN_TOKEN_KEY, payload.token)
    $('#admin-login').classList.remove('active')
    $('#admin-app').classList.add('active')
    hideMessage('admin-login-message')
    await loadAdminExams()
  } catch (error) {
    showMessage('admin-login-message', error.message, 'error')
  }
}

async function restoreAdminSession() {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY)
  if (!token) return
  state.adminToken = token
  try {
    await apiFetch('/api/exams')
    $('#admin-login').classList.remove('active')
    $('#admin-app').classList.add('active')
    await loadAdminExams()
  } catch (error) {
    state.adminToken = ''
    localStorage.removeItem(ADMIN_TOKEN_KEY)
  }
}

function logoutAdmin() {
  state.adminToken = ''
  state.adminExams = []
  state.editingExam = null
  state.statsPayload = null
  localStorage.removeItem(ADMIN_TOKEN_KEY)
  $('#admin-login').classList.add('active')
  $('#admin-app').classList.remove('active')
  renderExamEditor()
}

function bindEvents() {
  $('#tab-student').addEventListener('click', () => showTab('student'))
  $('#tab-teacher').addEventListener('click', () => showTab('teacher'))
  $('#jump-student').addEventListener('click', () => { showTab('student'); window.scrollTo({ top: 0, behavior: 'smooth' }) })
  $('#jump-teacher').addEventListener('click', () => { showTab('teacher'); window.scrollTo({ top: 0, behavior: 'smooth' }) })
  $('#student-filter').addEventListener('input', event => { state.studentFilter = event.target.value.trim(); renderPublishedExams() })
  $('#prev-question').addEventListener('click', () => { if (state.activeAttempt) { state.currentQuestionIndex = Math.max(0, state.currentQuestionIndex - 1); renderQuestion(); renderQuestionNav() } })
  $('#next-question').addEventListener('click', () => { if (state.activeAttempt) { state.currentQuestionIndex = Math.min(state.activeAttempt.exam.questions.length - 1, state.currentQuestionIndex + 1); renderQuestion(); renderQuestionNav() } })
  $('#submit-exam').addEventListener('click', () => { if (confirm('N?p b�i ngay b�y gi?? Sau khi n?p s? kh�ng th? s?a d�p �n.')) submitExam(false) })
  $('#save-now').addEventListener('click', () => saveProgress({ silent: false }))
  $('#leave-exam').addEventListener('click', () => { if (confirm('H?y lu?t l�m hi?n t?i v� x�a d? li?u luu tr�n tr�nh duy?t?')) resetStudentStage() })
  $('#start-another').addEventListener('click', () => { resetStudentStage(); window.scrollTo({ top: 0, behavior: 'smooth' }) })
  $('#back-home').addEventListener('click', () => { resetStudentStage(); window.scrollTo({ top: 0, behavior: 'smooth' }) })
  $('#admin-login-btn').addEventListener('click', adminLogin)
  $('#new-exam-btn').addEventListener('click', () => { state.editingExam = blankExam(); renderAdminExams(); renderExamEditor() })
  $('#reload-admin-btn').addEventListener('click', loadAdminExams)
  $('#logout-admin-btn').addEventListener('click', logoutAdmin)
  $('#admin-filter').addEventListener('input', event => { state.adminFilter = event.target.value.trim(); renderAdminExams() })
  $('#add-mc-btn').addEventListener('click', () => { collectEditingExam(); state.editingExam.questions.push(blankMultipleChoice()); renderExamEditor() })
  $('#add-tf-btn').addEventListener('click', () => { collectEditingExam(); state.editingExam.questions.push(blankTrueFalse()); renderExamEditor() })
  $('#save-exam-btn').addEventListener('click', () => saveEditingExam({ publish: false }))
  $('#publish-exam-btn').addEventListener('click', () => saveEditingExam({ publish: true }))
  $('#import-json-btn').addEventListener('click', importExamJson)
  $('#pick-json-btn').addEventListener('click', () => $('#json-file-input').click())
  $('#json-file-input').addEventListener('change', async event => { const file = event.target.files?.[0]; if (file) $('#import-json').value = await file.text() })
  $('#fill-export-btn').addEventListener('click', async () => { if (!state.editingExam?.id) return showMessage('admin-message', 'H�y ch?n m?t d? d� luu d? xu?t JSON.', 'warning'); await exportExamJson(state.editingExam.id) })
  $('#stats-exam-select').addEventListener('change', event => { state.selectedStatsExamId = event.target.value })
  $('#load-stats-btn').addEventListener('click', loadStats)
  window.addEventListener('beforeunload', event => { if (state.activeAttempt) { event.preventDefault(); event.returnValue = '' } })
}

async function init() {
  bindEvents()
  renderExamEditor()
  await checkServerHealth()
  await loadPublishedExams()
  await restoreAdminSession()
  await restoreStudentAttempt()
  cleanupVisibleText(document)
}

init()
