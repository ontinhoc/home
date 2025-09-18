// Các biến lưu trữ trạng thái
let currentQuestion = 0;
let score = 0;
let allowNext = false;
let shuffledQuestions = [];

// Hàm trộn mảng
function shuffleArray(arr) {
    return [...arr].sort(() => Math.random() - 0.5);
}

// Khởi tạo và trộn câu hỏi
function initQuiz(questions) {
    currentQuestion = 0;
    score = 0;
    allowNext = false;
    shuffledQuestions = [...questions];
    showQuestion();
}

// Xáo trộn câu hỏi
function shuffleQuestions() {
    shuffledQuestions = shuffleArray([...shuffledQuestions]);
    initQuiz(shuffledQuestions);
}

// Hiển thị câu hỏi
function showQuestion() {
    const q = shuffledQuestions[currentQuestion];
    const quizBox = document.getElementById('quiz-box');
    
    // Tạo mảng đáp án với chỉ số
    const optionsWithIndex = q.options.map((text, idx) => ({text, idx}));
    const shuffledOpts = shuffleArray(optionsWithIndex);
    
    quizBox.innerHTML = `
        <div class="question">Câu ${currentQuestion + 1}. ${q.question}</div>
        <div class="options">
            ${shuffledOpts.map((opt, i) => `
                <button class="option-btn" data-index="${opt.idx}">
                    ${String.fromCharCode(65 + i)}. ${opt.text}
                </button>
            `).join('')}
        </div>
        <div class="feedback" id="feedback"></div>
        <div class="explanation" id="explanation" style="display:none">${q.explanation}</div>
    `;

    // Thêm event listeners cho các nút đáp án
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.onclick = (e) => checkAnswer(e.target);
    });

    // Ẩn nút tiếp theo và ẩn kết quả
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('summary').classList.add('hidden');
    document.getElementById('quiz-box').classList.remove('hidden');
}

// Kiểm tra đáp án
function checkAnswer(selectedButton) {
    if (allowNext) return; // Ngăn chặn click nhiều lần

    const selectedIndex = parseInt(selectedButton.dataset.index);
    const correctAnswer = shuffledQuestions[currentQuestion].answer;
    const isCorrect = selectedIndex === correctAnswer;
    const feedback = document.getElementById('feedback');
    const explanation = document.getElementById('explanation');

    // Vô hiệu hóa tất cả các nút và hiển thị đáp án đúng/sai
    document.querySelectorAll('.option-btn').forEach(btn => {
        btn.disabled = true;
        const btnIndex = parseInt(btn.dataset.index);
        
        if (btnIndex === correctAnswer) {
            btn.classList.add('correct');
        } else if (btn === selectedButton && !isCorrect) {
            btn.classList.add('wrong');
        }
    });

    // Cập nhật điểm và hiển thị phản hồi
    if (isCorrect) {
        score++;
        feedback.textContent = "Chính xác! Bạn đã trả lời đúng.";
        feedback.className = "feedback success";
        document.getElementById('audio-correct').play().catch(e => console.log('Audio play failed:', e));
    } else {
        feedback.textContent = "Rất tiếc! Đáp án chưa chính xác.";
        feedback.className = "feedback error";
        document.getElementById('audio-wrong').play().catch(e => console.log('Audio play failed:', e));
    }

    // Hiển thị giải thích
    explanation.style.display = 'block';

    // Cho phép chuyển câu tiếp theo
    allowNext = true;
    const nextBtn = document.getElementById('next-btn');
    nextBtn.classList.remove('hidden');
    nextBtn.textContent = currentQuestion < shuffledQuestions.length - 1 ? 'Câu tiếp theo' : 'Xem kết quả';
}

// Xử lý chuyển câu hỏi
function nextQuestion() {
    if (!allowNext) return;
    
    if (currentQuestion < shuffledQuestions.length - 1) {
        currentQuestion++;
        allowNext = false;
        showQuestion();
    } else {
        showSummary();
    }
}

// Hiển thị kết quả cuối cùng
function showSummary() {
    const summary = document.getElementById('summary');
    const percentage = Math.round((score / shuffledQuestions.length) * 100);
    let feedback;

    if (percentage === 100) {
        feedback = "Xuất sắc! Bạn đã hoàn thành hoàn hảo bài kiểm tra!";
    } else if (percentage >= 80) {
        feedback = "Rất tốt! Bạn đã nắm vững kiến thức!";
    } else if (percentage >= 60) {
        feedback = "Khá tốt! Hãy cố gắng hơn nữa!";
    } else {
        feedback = "Bạn cần ôn tập thêm. Đừng nản lòng!";
    }

    summary.innerHTML = `
        <h2>Kết quả của bạn</h2>
        <p>Số câu đúng: ${score}/${shuffledQuestions.length}</p>
        <p>Tỷ lệ đúng: ${percentage}%</p>
        <p>${feedback}</p>
    `;
    summary.classList.remove('hidden');
    document.getElementById('quiz-box').classList.add('hidden');
    document.getElementById('next-btn').classList.add('hidden');
}

// Khởi tạo quiz
function initializeQuiz(questions) {
    document.getElementById('next-btn').onclick = nextQuestion;
    document.getElementById('retry-btn').onclick = () => initQuiz(questions);
    document.getElementById('shuffle-btn').onclick = shuffleQuestions;
    initQuiz(questions);
}