const URL_PARAMS = new URLSearchParams(window.location.search)
const QUERY_API_BASE = normalizeApiBase(URL_PARAMS.get('apiBase') || '')
const QUERY_API_FALLBACKS = parseApiBaseList(URL_PARAMS.get('apiFallbacks') || '')
const CONFIGURED_API_BASE = QUERY_API_BASE || normalizeApiBase(window.ONTHI_API_BASE || document.documentElement.dataset.apiBase || '')
const CONFIGURED_API_FALLBACKS = [
  ...QUERY_API_FALLBACKS,
  ...parseApiBaseList(window.ONTHI_API_FALLBACKS || document.documentElement.dataset.apiFallbacks || '')
]
const IS_LOCAL_FRONTEND = location.protocol === 'file:' || ['127.0.0.1', 'localhost'].includes(location.hostname)
const API_BASE_CANDIDATES = buildApiBaseCandidates()
const STUDENT_STORAGE_KEY = 'onthi-thpt-tinhoc-active-attempt'
const ADMIN_TOKEN_KEY = 'onthi-thpt-tinhoc-admin-token'
const DEFAULT_EMPTY_EXAM_MESSAGE = 'Hiện chưa có đề nào được phát hành. Hãy chạy server Node và phát hành ít nhất một đề trong khu giáo viên.'

const state = {
  apiCandidates: API_BASE_CANDIDATES,
  apiBase: '',
  apiAvailable: false,
  apiLastError: '',
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

function normalizeApiBase(base) {
  const next = String(base || '').trim()
  if (!next || next === '/') return ''
  return next.replace(/\/+$/, '')
}

function parseApiBaseList(value) {
  return String(value || '')
    .split(',')
    .map(item => normalizeApiBase(item))
    .filter(Boolean)
}

function dedupeApiBases(bases) {
  const seen = new Set()
  const result = []
  for (const base of bases.map(item => normalizeApiBase(item))) {
    const key = base || '__same_origin__'
    if (seen.has(key)) continue
    seen.add(key)
    result.push(base)
  }
  return result
}

function buildApiBaseCandidates() {
  const bases = [CONFIGURED_API_BASE, ...CONFIGURED_API_FALLBACKS]
  if (IS_LOCAL_FRONTEND) {
    if (location.port !== '3000') bases.push('http://127.0.0.1:3000')
  } else {
    bases.push('')
  }
  return dedupeApiBases(bases)
}

function formatApiBaseLabel(base) {
  return normalizeApiBase(base) || window.location.origin
}

function buildApiUrl(base, path) {
  return `${normalizeApiBase(base)}${path}`
}

function buildApiUnavailableMessage() {
  const tried = state.apiCandidates.length
    ? state.apiCandidates.map(formatApiBaseLabel).join(' | ')
    : window.location.origin
  return `API chưa sẵn sàng. Đã thử: ${tried}. Hãy kiểm tra DNS/Cloudflare của api.ontapnhanh.com hoặc cấu hình fallback bằng data-api-fallbacks, window.ONTHI_API_FALLBACKS, hoặc tham số ?apiBase=.`
}

const TEXT_FIXES = [
  ['B?t d?u lï¿½m bï¿½i', 'Bắt đầu làm bài'],
  ['N?p bï¿½i', 'Nộp bài'],
  ['Lï¿½m d? khï¿½c', 'Làm đề khác'],
  ['Quay v? danh sï¿½ch d?', 'Quay về danh sách đề'],
  ['Khï¿½ng t?i du?c danh sï¿½ch d?:', 'Không tải được danh sách đề:'],
  ['Khï¿½ng luu du?c ti?n d?:', 'Không lưu được tiến độ:'],
  ['Khï¿½ng n?p du?c bï¿½i:', 'Không nộp được bài:'],
  ['Khï¿½ng cï¿½ mï¿½ t? thï¿½m.', 'Không có mô tả thêm.'],
  ['De on thi TNTHPT Tin hoc 0501', 'Đề ôn thi TNTHPT Tin học 0501'],
  ['De mau de kiem thu he thong cloudflare worker. Giao vien co the chinh sua hoac import de moi bang JSON.', 'Đề mẫu để kiểm thử hệ thống Cloudflare Worker. Giáo viên có thể chỉnh sửa hoặc import đề mới bằng JSON.'],
  ['Trong mang may tinh, thiet bi nao dung de dinh tuyen goi tin giua cac mang?', 'Trong mạng máy tính, thiết bị nào dùng để định tuyến gói tin giữa các mạng?'],
  ['Router la thiet bi thuc hien chuc nang dinh tuyen giua cac mang khac nhau.', 'Router là thiết bị thực hiện chức năng định tuyến giữa các mạng khác nhau.'],
  ['The HTML nao bieu dien tieu de lon nhat tren trang?', 'Thẻ HTML nào biểu diễn tiêu đề lớn nhất trên trang?'],
  ['Trong HTML, h1 la muc tieu de cao nhat.', 'Trong HTML, h1 là mức tiêu đề cao nhất.'],
  ['Danh gia cac nhan dinh sau ve tri tue nhan tao:', 'Đánh giá các nhận định sau về trí tuệ nhân tạo:'],
  ['AI yeu chi giai quyet tot cac nhiem vu chuyen biet; du lieu huan luyen anh huong manh den ket qua.', 'AI yếu chỉ giải quyết tốt các nhiệm vụ chuyên biệt; dữ liệu huấn luyện ảnh hưởng mạnh đến kết quả.'],
  ['AI tao sinh co the tao van ban hoac hinh anh tu du lieu da hoc.', 'AI tạo sinh có thể tạo văn bản hoặc hình ảnh từ dữ liệu đã học.'],
  ['Day la nang luc dien hinh cua AI tao sinh.', 'Đây là năng lực điển hình của AI tạo sinh.'],
  ['AI manh hien da duoc trien khai pho bien trong truong hoc.', 'AI mạnh hiện đã được triển khai phổ biến trong trường học.'],
  ['AI manh theo nghia tu nhan thuc van chua ton tai thuc te.', 'AI mạnh theo nghĩa tự nhận thức vẫn chưa tồn tại thực tế.'],
  ['B?n ch?n:', 'Bạn chọn:'],
  ['Mï¿½ d?:', 'Mã đề:'],
  ['Th?i luong', 'Thời lượng'],
  ['Th?i gian', 'Thời gian'],
  ['Ti?n d?', 'Tiến độ'],
  ['Khï¿½ng', 'Không'],
  ['Hï¿½y', 'Hãy'],
  ['Mï¿½', 'Mã'],
  ['K?t qu?', 'Kết quả'],
  ['H?c sinh', 'Học sinh'],
  ['Giao viï¿½n', 'Giáo viên'],
  ['giï¿½o viï¿½n', 'giáo viên'],
  ['S?n sï¿½ng', 'Sẵn sàng'],
  ['cï¿½u', 'câu'],
  ['Cï¿½u', 'Câu'],
  ['phï¿½t', 'phút'],
  ['lu?t', 'lượt'],
  ['bï¿½i', 'bài'],
  ['lï¿½m', 'làm'],
  ['ï¿½ï¿½ng', 'Đúng'],
  ['ï¿½ï¿½ luu', 'Đã lưu'],
  ['ï¿½ang', 'Đang'],
  ['ï¿½i?m', 'Điểm'],
  ['ï¿½ï¿½p ï¿½n', 'Đáp án'],
  ['ï¿½ï¿½ tr?', 'Đã trả'],
  ['ï¿½ï¿½ khï¿½i ph?c', 'Đã khôi phục'],
  ['Th?ng kï¿½', 'Thống kê'],
  ['S?a', 'Sửa'],
  ['Xï¿½a', 'Xóa'],
  ['Lï¿½n', 'Lên'],
  ['Xu?ng', 'Xuống']
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
  el.textContent = fixBrokenVietnamese(text)
  el.className = `message show ${type}`
}

function hideMessage(targetId) {
  const el = document.getElementById(targetId)
  if (!el) return
  el.textContent = ''
  el.className = 'message'
}

function showAdminFeedback(text, type = 'info') {
  showMessage('admin-message', text, type)
  showMessage('editor-action-message', text, type)
  const inlineMessage = $('#editor-action-message')
  if (inlineMessage) {
    inlineMessage.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }
}

function hideAdminFeedback() {
  hideMessage('admin-message')
  hideMessage('editor-action-message')
}

function setAdminActionBusy(isBusy, mode = 'save') {
  const saveBtn = $('#save-exam-btn')
  const publishBtn = $('#publish-exam-btn')
  if (!saveBtn || !publishBtn) return
  saveBtn.disabled = isBusy
  publishBtn.disabled = isBusy
  saveBtn.textContent = isBusy && mode === 'save' ? 'Đang lưu...' : 'Lưu đề'
  publishBtn.textContent = isBusy && mode === 'publish' ? 'Đang phát hành...' : 'Lưu và phát hành'
}

function mapExamEditorError(error) {
  const raw = String(error?.message || error || '')
  const mappings = [
    ['exam_code_required', 'Hãy nhập mã đề trước khi lưu.'],
    ['exam_title_required', 'Hãy nhập tiêu đề đề trước khi lưu.'],
    ['exam_questions_required', 'Đề thi phải có ít nhất 1 câu hỏi trước khi lưu hoặc phát hành.'],
    ['exam_code_duplicated', 'Mã đề đã tồn tại. Hãy đổi sang mã đề khác.'],
    ['question_1_text_required', 'Có câu hỏi chưa nhập nội dung. Hãy kiểm tra lại.'],
    ['_text_required', 'Có câu hỏi hoặc nhận định chưa nhập nội dung. Hãy kiểm tra lại.'],
    ['_choices_invalid', 'Mỗi câu 4 lựa chọn phải có đủ 4 đáp án.'],
    ['_must_have_one_correct_choice', 'Mỗi câu 4 lựa chọn phải có đúng 1 đáp án đúng.'],
    ['_statements_invalid', 'Mỗi câu đúng/sai phải có ít nhất 2 nhận định.'],
    ['admin_auth_required', 'Phiên đăng nhập giáo viên đã hết hạn. Hãy đăng nhập lại.'],
    ['invalid_admin_password', 'Mật khẩu giáo viên không đúng.']
  ]
  for (const [needle, message] of mappings) {
    if (raw.includes(needle)) return message
  }
  return fixBrokenVietnamese(raw) || 'Không thể lưu đề lúc này.'
}

function validateEditingExamDraft(exam) {
  if (!exam.code) throw new Error('Hãy nhập mã đề trước khi lưu.')
  if (!exam.title) throw new Error('Hãy nhập tiêu đề đề trước khi lưu.')
  if (!Array.isArray(exam.questions) || exam.questions.length === 0) {
    throw new Error('Đề thi phải có ít nhất 1 câu hỏi trước khi lưu hoặc phát hành.')
  }
}

async function apiFetch(path, options = {}) {
  if (path !== '/api/health' && !state.apiAvailable) {
    throw new Error(buildApiUnavailableMessage())
  }
  const base = state.apiBase || state.apiCandidates[0] || ''
  return performApiFetch(base, path, options)
}

async function performApiFetch(base, path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) }
  if (state.adminToken) headers.Authorization = `Bearer ${state.adminToken}`
  let response
  try {
    response = await fetch(buildApiUrl(base, path), { ...options, headers })
  } catch (error) {
    const detail = error?.message ? ` ${error.message}` : ''
    throw new Error(`Không kết nối được tới ${formatApiBaseLabel(base)}.${detail}`.trim())
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data.error || data.message || `Request failed: ${response.status} tai ${formatApiBaseLabel(base)}`)
  }
  return data
}

function formatDuration(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds))
  const minutes = Math.floor(safe / 60)
  const seconds = safe % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function formatDateTime(value) {
  if (!value) return 'Chưa có'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('vi-VN')
}

function formatQuestionTypeLabel(type) {
  if (type === 'multiple_choice') return '4 lựa chọn'
  if (type === 'true_false_group') return 'Đúng / Sai'
  return type
}

function escapeHtml(text) {
  return String(fixBrokenVietnamese(text || ''))
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
    throw new Error('Hãy nhập đủ họ tên, lớp và mã học sinh/SBD trước khi bắt đầu.')
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
  const preferredBase = state.apiCandidates[0] || ''
  $('#api-base-label').textContent = formatApiBaseLabel(preferredBase)
  $('#api-active-label').textContent = 'Đang kiểm tra...'
  $('#api-status-detail').textContent = `Đang thử ${Math.max(state.apiCandidates.length, 1)} địa chỉ API.`
  const errors = []

  for (const base of state.apiCandidates.length ? state.apiCandidates : ['']) {
    try {
      await performApiFetch(base, '/api/health')
      state.apiBase = base
      state.apiAvailable = true
      state.apiLastError = ''
      $('#api-active-label').textContent = formatApiBaseLabel(base)
      $('#server-status').textContent = 'Sẵn sàng'
      $('#server-status').style.color = '#9bf6c7'
      $('#api-status-detail').textContent = base === preferredBase
        ? 'Kết nối API thành công.'
        : `Đã tự động chuyển sang fallback ${formatApiBaseLabel(base)}.`
      hideMessage('global-message')
      return
    } catch (error) {
      errors.push(`${formatApiBaseLabel(base)}: ${error.message}`)
    }
  }

  state.apiAvailable = false
  state.apiBase = preferredBase
  state.apiLastError = errors.join(' | ')
  $('#api-active-label').textContent = 'Không có API khả dụng'
  $('#server-status').textContent = 'Chưa kết nối'
  $('#server-status').style.color = '#ffd6d6'
  $('#api-status-detail').textContent = `Đã thử: ${(state.apiCandidates.length ? state.apiCandidates : ['']).map(formatApiBaseLabel).join(' | ')}`
  showMessage('global-message', buildApiUnavailableMessage(), 'error')
}

async function loadPublishedExams() {
  if (!state.apiAvailable) {
    state.publishedExams = []
    $('#published-count').textContent = '0'
    renderPublishedExams()
    return
  }
  try {
    const data = await apiFetch('/api/exams')
    state.publishedExams = Array.isArray(data.exams) ? data.exams : []
    $('#published-count').textContent = String(state.publishedExams.length)
    renderPublishedExams()
  } catch (error) {
    renderPublishedExams()
    showMessage('student-message', `Không tải được danh sách đề: ${error.message}`, 'error')
  }
}

function renderPublishedExams() {
  const container = $('#exam-list')
  const emptyBox = $('#exam-empty')
  if (!state.apiAvailable) {
    container.innerHTML = ''
    emptyBox.textContent = 'Không tải được danh sách đề thi vì API chưa sẵn sàng. Kiểm tra DNS/Cloudflare của api.ontapnhanh.com hoặc cấu hình fallback API.'
    emptyBox.classList.add('show')
    return
  }
  emptyBox.textContent = DEFAULT_EMPTY_EXAM_MESSAGE
  const filter = state.studentFilter.toLowerCase()
  const exams = state.publishedExams.filter(exam => {
    const haystack = `${exam.code} ${exam.title} ${exam.description || ''}`.toLowerCase()
    return haystack.includes(filter)
  })

  container.innerHTML = exams.map(exam => `
    <article class="exam-card">
      <div class="badge-row">
        <span class="badge">${escapeHtml(exam.code)}</span>
        <span class="badge navy">${exam.questionCount} câu</span>
        <span class="badge success">${exam.totalPoints} điểm tối đa</span>
      </div>
      <h3>${escapeHtml(exam.title)}</h3>
      <p>${escapeHtml(exam.description || 'Không có mô tả thêm.')}</p>
      <div class="progress-row" style="margin-top:14px">
        <span>Thời lượng</span>
        <strong>${exam.durationMinutes} phút</strong>
      </div>
      <div class="toolbar" style="margin-top:14px">
        <button class="btn btn-primary" data-start-exam="${exam.id}">Bắt đầu làm bài</button>
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
  $('#active-progress-meta').textContent = `Đã trả lời ${answered}/${total}`
}

function renderSaveStatus() {
  $('#save-status').textContent = state.activeAttempt?.lastSavedAt
    ? `Đã lưu lúc ${formatDateTime(state.activeAttempt.lastSavedAt)}`
    : 'Chưa lưu lên server'
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
  $('#question-number').textContent = `Câu ${state.currentQuestionIndex + 1} / ${attempt.exam.questions.length}`
  $('#question-text').textContent = fixBrokenVietnamese(question.text)
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
                <button type="button" class="${group[statement.key] === true ? 'active true' : ''}" data-tf-key="${statement.key}" data-tf-value="true">Đúng</button>
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
  $('#active-exam-code').textContent = `Mã đề: ${attempt.exam.code}`
  $('#active-exam-title').textContent = fixBrokenVietnamese(attempt.exam.title)
  $('#active-student-meta').textContent = `${fixBrokenVietnamese(attempt.student.name)} • ${fixBrokenVietnamese(attempt.student.className)} • ${fixBrokenVietnamese(attempt.student.studentCode)}`
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
    $('#autosave-note').textContent = 'Đang lưu tiến độ...'
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
    $('#autosave-note').textContent = 'Tiến độ đã được đồng bộ với server.'
    if (!silent) showMessage('student-message', 'Đã lưu tiến độ hiện tại.', 'success')
  } catch (error) {
    $('#autosave-note').textContent = `Lưu thất bại: ${error.message}`
    if (!silent) showMessage('student-message', `Không lưu được tiến độ: ${error.message}`, 'error')
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
    if (forceAuto) showMessage('student-message', 'Hết 50 phút, hệ thống đã tự nộp bài.', 'warning')
    else showMessage('student-message', 'Nộp bài thành công.', 'success')
  } catch (error) {
    $('#submit-exam').disabled = false
    showMessage('student-message', `Không nộp được bài: ${error.message}`, 'error')
  } finally {
    state.isSubmitting = false
  }
}

function renderResult(payload, attempt) {
  state.completedAttempt = attempt || null
  $('#result-stage').classList.add('active')
  $('#result-exam-badge').textContent = attempt ? `Mã đề: ${attempt.exam.code}` : 'Kết quả'
  $('#result-student-badge').textContent = attempt ? `${fixBrokenVietnamese(attempt.student.name)} • ${fixBrokenVietnamese(attempt.student.className)}` : 'Học sinh'
  const summary = payload.summary || {}
  const cards = [
    { label: 'Điểm thang 10', value: payload.score ?? 0 },
    { label: 'Đúng / Tổng', value: `${summary.correctCount ?? 0}/${summary.totalPoints ?? 0}` },
    { label: 'Tỷ lệ hoàn thành', value: `${summary.completionRate ?? 0}%` },
    { label: 'Thời gian dùng', value: formatDuration(summary.durationUsedSeconds ?? 0) }
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
            <span class="badge">Câu ${index + 1}</span>
            <span class="badge ${item.isCorrect ? 'success' : 'warning'}">${item.isCorrect ? 'Đúng' : 'Sai'}</span>
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
            Bạn chọn: <strong>${escapeHtml(item.submittedAnswer || 'Chưa trả lời')}</strong><br>
            Đáp án đúng: <strong>${escapeHtml(item.correctAnswer || 'Chưa xác định')}</strong><br>
            ${escapeHtml(item.explanation || 'Không có lời giải bổ sung.')}
          </div>
        </article>
      `
    }
    return `
      <article class="question-card">
        <div class="badge-row">
          <span class="badge">Câu ${index + 1}</span>
          <span class="badge navy">Đúng/Sai</span>
        </div>
        <h3>${escapeHtml(item.text)}</h3>
        <div class="statement-list">
          ${(item.statements || []).map(statement => `
            <div class="review-statement ${statement.isCorrect ? 'correct' : statement.isAnswered ? 'wrong' : ''}">
              <strong>${escapeHtml(statement.key.toUpperCase())}.</strong> ${escapeHtml(statement.text)}<br>
              Bạn chọn: <strong>${statement.submittedAnswer === null ? 'Chưa trả lời' : (statement.submittedAnswer ? 'Đúng' : 'Sai')}</strong><br>
              Đáp án đúng: <strong>${statement.correctAnswer ? 'Đúng' : 'Sai'}</strong>
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
    showMessage('student-message', 'Đã khôi phục lượt làm bài đang dở từ trình duyệt này.', 'info')
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
  $('#question-count-badge').textContent = `${(exam.questions || []).length} câu hỏi`
  $('#question-editor-list').innerHTML = (exam.questions || []).map((question, index) => {
    if (question.type === 'multiple_choice') {
      return `
        <article class="question-card">
          <div class="badge-row">
            <span class="badge">Câu ${index + 1}</span>
            <span class="badge navy">4 lựa chọn</span>
          </div>
          <div class="toolbar">
            <button class="btn btn-soft" data-move-up="${index}">Lên</button>
            <button class="btn btn-soft" data-move-down="${index}">Xuống</button>
            <button class="btn btn-danger" data-remove-question="${index}">Xóa</button>
          </div>
          <div class="field"><label>Nội dung câu hỏi</label><textarea data-field="question-text" data-index="${index}">${escapeHtml(question.text)}</textarea></div>
          <div class="field"><label>Lời giải ngắn</label><textarea data-field="question-explanation" data-index="${index}">${escapeHtml(question.explanation || '')}</textarea></div>
          <div class="choice-editor">
            ${(question.choices || []).map((choice, choiceIndex) => `
              <div class="mini-grid">
                <input type="text" value="${escapeHtml(choice.key)}" data-choice-key="${index}-${choiceIndex}" placeholder="A">
                <input type="text" value="${escapeHtml(choice.text)}" data-choice-text="${index}-${choiceIndex}" placeholder="Nội dung đáp án">
                <select data-choice-correct="${index}-${choiceIndex}">
                  <option value="false" ${choice.correct ? '' : 'selected'}>Sai</option>
                  <option value="true" ${choice.correct ? 'selected' : ''}>Đúng</option>
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
          <span class="badge">Câu ${index + 1}</span>
          <span class="badge navy">Đúng / Sai</span>
        </div>
        <div class="toolbar">
          <button class="btn btn-soft" data-move-up="${index}">Lên</button>
          <button class="btn btn-soft" data-move-down="${index}">Xuống</button>
          <button class="btn btn-danger" data-remove-question="${index}">Xóa</button>
        </div>
        <div class="field"><label>Nội dung câu hỏi</label><textarea data-field="question-text" data-index="${index}">${escapeHtml(question.text)}</textarea></div>
        <div class="field"><label>Giải thích chung</label><textarea data-field="question-explanation" data-index="${index}">${escapeHtml(question.explanation || '')}</textarea></div>
        <div class="statement-editor">
          ${(question.statements || []).map((statement, statementIndex) => `
            <div class="mini-grid tf">
              <input type="text" value="${escapeHtml(statement.key)}" data-statement-key="${index}-${statementIndex}" placeholder="a">
              <input type="text" value="${escapeHtml(statement.text)}" data-statement-text="${index}-${statementIndex}" placeholder="Nhận định">
              <select data-statement-answer="${index}-${statementIndex}">
                <option value="true" ${statement.answer ? 'selected' : ''}>Đúng</option>
                <option value="false" ${statement.answer ? '' : 'selected'}>Sai</option>
              </select>
              <button class="btn btn-danger" data-remove-statement="${index}-${statementIndex}">Xóa</button>
              <textarea data-statement-explanation="${index}-${statementIndex}" placeholder="Giải thích cho nhận định" style="grid-column:1 / -1; min-height:80px">${escapeHtml(statement.explanation || '')}</textarea>
            </div>
          `).join('')}
        </div>
        <div class="toolbar"><button class="btn btn-soft" data-add-statement="${index}">Thêm nhận định</button></div>
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
        <span class="badge ${exam.status === 'published' ? 'success' : 'warning'}">${exam.status === 'published' ? 'Đã phát hành' : 'Nháp'}</span>
      </div>
      <h4>${escapeHtml(exam.title)}</h4>
      <p>${escapeHtml(exam.description || 'Không có mô tả')}</p>
      <div class="note">Số câu: ${exam.questionCount} • Cập nhật: ${formatDateTime(exam.updatedAt)}</div>
      <div class="toolbar">
        <button class="btn btn-soft" data-edit-exam="${exam.id}">Sửa</button>
        <button class="btn btn-soft" data-stats-exam="${exam.id}">Thống kê</button>
        <button class="btn btn-soft" data-export-exam="${exam.id}">Xuất JSON</button>
        <button class="btn ${exam.status === 'published' ? 'btn-soft' : 'btn-primary'}" data-toggle-publish="${exam.id}" data-next-status="${exam.status === 'published' ? 'draft' : 'published'}">${exam.status === 'published' ? 'Ẩn đề' : 'Phát hành'}</button>
        <button class="btn btn-danger" data-delete-exam="${exam.id}">Xóa</button>
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
  `).join('') || '<option value="">Chưa có đề</option>'
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
    showMessage('admin-message', `Không tải được danh sách đề: ${error.message}`, 'error')
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
  hideAdminFeedback()
  setAdminActionBusy(true, publish ? 'publish' : 'save')
  try {
    const exam = deepClone(collectEditingExam())
    validateEditingExamDraft(exam)
    if (publish) exam.status = 'published'
    const method = exam.id ? 'PUT' : 'POST'
    const path = exam.id ? `/api/exams/${exam.id}` : '/api/exams'
    const payload = await apiFetch(path, { method, body: JSON.stringify(exam) })
    state.editingExam = payload.exam
    renderExamEditor()
    showAdminFeedback(publish ? `Đã lưu và phát hành đề ${payload.exam.code} thành công.` : `Đã lưu đề ${payload.exam.code} thành công.`, 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showAdminFeedback(mapExamEditorError(error), 'error')
  } finally {
    setAdminActionBusy(false)
  }
}

async function setPublishState(examId, status) {
  try {
    await apiFetch(`/api/exams/${examId}/publish`, { method: 'POST', body: JSON.stringify({ status }) })
    showMessage('admin-message', status === 'published' ? 'Đề đã được phát hành.' : 'Đề đã chuyển về trạng thái nháp.', 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function deleteExam(examId) {
  if (!confirm('Xóa đề này? Hành động này không hoàn tác được.')) return
  try {
    await apiFetch(`/api/exams/${examId}`, { method: 'DELETE' })
    if (state.editingExam?.id === examId) state.editingExam = null
    renderExamEditor()
    showMessage('admin-message', 'Đã xóa đề thi.', 'success')
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
    showMessage('admin-message', 'Đã xuất JSON của đề đang chọn.', 'success')
  } catch (error) {
    showMessage('admin-message', error.message, 'error')
  }
}

async function importExamJson() {
  try {
    const raw = $('#import-json').value.trim()
    if (!raw) throw new Error('Hãy dán JSON đề thi trước khi import.')
    await apiFetch('/api/exams/import', { method: 'POST', body: raw })
    $('#import-json').value = ''
    showMessage('admin-message', 'Import đề từ JSON thành công.', 'success')
    await loadAdminExams()
    await loadPublishedExams()
  } catch (error) {
    showMessage('admin-message', `Import thất bại: ${error.message}`, 'error')
  }
}

function renderStats() {
  const payload = state.statsPayload
  if (!payload?.stats) return
  const stats = payload.stats
  const cards = [
    { label: 'Số lượt làm', value: stats.attemptCount },
    { label: 'Điểm trung bình', value: stats.averageScore },
    { label: 'Điểm cao nhất', value: stats.highestScore },
    { label: 'Điểm thấp nhất', value: stats.lowestScore }
  ]
  $('#stats-metrics').innerHTML = cards.map(card => `<div class="stat-card"><span>${escapeHtml(card.label)}</span><strong>${escapeHtml(card.value)}</strong></div>`).join('')
  $('#distribution-box').innerHTML = `<strong>Phân bố điểm:</strong><br>Dưới 5: ${stats.distribution.below5} lượt<br>Từ 5 đến dưới 7: ${stats.distribution.from5to7} lượt<br>Từ 7 đến dưới 8.5: ${stats.distribution.from7to8_5} lượt<br>Từ 8.5 đến 10: ${stats.distribution.from8_5to10} lượt`
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
    showMessage('admin-message', `Không tải được thống kê: ${error.message}`, 'error')
  }
}

async function loadAttemptDetail(attemptId) {
  try {
    const payload = await apiFetch(`/api/results/${attemptId}`)
    $('#attempt-detail').innerHTML = `
      <article class="attempt-card">
        <h4>${escapeHtml(payload.student.name)} • ${escapeHtml(payload.examTitle)}</h4>
        <p>Điểm: <strong>${escapeHtml(payload.score)}</strong> • Nộp lúc ${escapeHtml(formatDateTime(payload.submittedAt))}</p>
        <p>Làm trong ${escapeHtml(formatDuration(payload.summary.durationUsedSeconds || 0))} • Đúng ${escapeHtml(payload.summary.correctCount)}/${escapeHtml(payload.summary.totalPoints)}</p>
      </article>
      ${(payload.review || []).map((item, index) => `
        <article class="question-card">
          <div class="badge-row"><span class="badge">Câu ${index + 1}</span><span class="badge navy">${escapeHtml(formatQuestionTypeLabel(item.type))}</span></div>
          <h3>${escapeHtml(item.text)}</h3>
          ${item.type === 'multiple_choice'
            ? (item.choices || []).map(choice => `<div class="review-choice ${choice.correct ? 'correct' : (item.submittedAnswer === choice.key ? 'wrong' : '')}"><strong>${escapeHtml(choice.key)}.</strong> ${escapeHtml(choice.text)}</div>`).join('')
            : (item.statements || []).map(statement => `<div class="review-statement ${statement.isCorrect ? 'correct' : statement.isAnswered ? 'wrong' : ''}"><strong>${escapeHtml(statement.key.toUpperCase())}.</strong> ${escapeHtml(statement.text)}<br>Bạn chọn: ${statement.submittedAnswer === null ? 'Chưa trả lời' : (statement.submittedAnswer ? 'Đúng' : 'Sai')}<br>Đáp án: ${statement.correctAnswer ? 'Đúng' : 'Sai'}</div>`).join('')
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
    if (!password) throw new Error('Hãy nhập mật khẩu admin.')
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
  if (!state.apiAvailable) return
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
  $('#submit-exam').addEventListener('click', () => { if (confirm('Nộp bài ngay bây giờ? Sau khi nộp sẽ không thể sửa đáp án.')) submitExam(false) })
  $('#save-now').addEventListener('click', () => saveProgress({ silent: false }))
  $('#leave-exam').addEventListener('click', () => { if (confirm('Hủy lượt làm hiện tại và xóa dữ liệu lưu trên trình duyệt?')) resetStudentStage() })
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
  $('#fill-export-btn').addEventListener('click', async () => { if (!state.editingExam?.id) return showMessage('admin-message', 'Hãy chọn một đề đã lưu để xuất JSON.', 'warning'); await exportExamJson(state.editingExam.id) })
  $('#stats-exam-select').addEventListener('change', event => { state.selectedStatsExamId = event.target.value })
  $('#load-stats-btn').addEventListener('click', loadStats)
  window.addEventListener('beforeunload', event => { if (state.activeAttempt) { event.preventDefault(); event.returnValue = '' } })
}

async function init() {
  bindEvents()
  renderExamEditor()
  $('#exam-empty').textContent = DEFAULT_EMPTY_EXAM_MESSAGE
  await checkServerHealth()
  await loadPublishedExams()
  await restoreAdminSession()
  await restoreStudentAttempt()
  cleanupVisibleText(document)
}

init()
