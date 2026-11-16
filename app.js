/**
 * Trắc Nghiệm Xã Hội Học Đại Cương
 * Đề thi 50 câu ngẫu nhiên • Thang điểm 10 (50/50 câu = 10 điểm)
 * Tự động đảo vị trí câu hỏi và đáp án không trùng lặp
 */

(function () {
  'use strict';

  const TOTAL_EXAM_QUESTIONS = 50;
  const STORAGE_KEY_SESSION = 'xhh_current_exam_session';

  // State Management
  const state = {
    allQuestions: typeof QUIZ_DATA !== 'undefined' ? QUIZ_DATA : [],
    viewMode: 'list', // 'list' | 'focus'
    
    activeQuestions: [],      // 50 Shuffled questions currently in the quiz
    userAnswers: {},          // { questionIndex: selectedOptionIndex }
    flagged: new Set(),       // Set of questionIndex flagged
    
    currentFocusIndex: 0,
    isSubmitted: false,
    activeFilter: 'all',      // 'all' | 'correct' | 'wrong' | 'unanswered'
    
    // Timer: 60 minutes for 50 questions
    timerSeconds: 60 * 60,
    initialTimerSeconds: 60 * 60,
    timerInterval: null,
    timeSpent: 0,
    isTimerPaused: false,
    
    // History
    history: []
  };

  // DOM Elements
  const el = {
    btnRetake: document.getElementById('btnRetake'),
    btnSubmit: document.getElementById('btnSubmit'),
    btnToggleTimer: document.getElementById('btnToggleTimer'),
    timerDisplay: document.getElementById('timerDisplay'),
    timerBox: document.getElementById('timerBox'),
    progressCount: document.getElementById('progressCount'),
    progressBar: document.getElementById('progressBar'),
    questionsContainer: document.getElementById('questionsContainer'),
    paletteGrid: document.getElementById('paletteGrid'),
    answeredCountBadge: document.getElementById('answeredCountBadge'),
    scoreBanner: document.getElementById('scoreBanner'),
    scoreVal: document.getElementById('scoreVal'),
    scoreGrade: document.getElementById('scoreGrade'),
    statCorrect: document.getElementById('statCorrect'),
    statWrong: document.getElementById('statWrong'),
    statUnanswered: document.getElementById('statUnanswered'),
    statTime: document.getElementById('statTime'),
    filterBar: document.getElementById('filterBar'),
    
    // View mode toggles
    btnViewList: document.getElementById('btnViewList'),
    btnViewFocus: document.getElementById('btnViewFocus'),
    
    // Modals
    historyModal: document.getElementById('historyModal'),
    btnHistory: document.getElementById('btnHistory'),
    btnCloseHistory: document.getElementById('btnCloseHistory'),
    historyTableBody: document.getElementById('historyTableBody'),
    btnClearHistory: document.getElementById('btnClearHistory'),
    
    searchModal: document.getElementById('searchModal'),
    btnSearchModal: document.getElementById('btnSearchModal'),
    btnCloseSearch: document.getElementById('btnCloseSearch'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    
    themeToggle: document.getElementById('themeToggle'),
    themeIcon: document.getElementById('themeIcon'),
    
    // Mobile Drawer
    quizSidebar: document.getElementById('quizSidebar'),
    btnMobilePalette: document.getElementById('btnMobilePalette'),
    btnCloseSidebar: document.getElementById('btnCloseSidebar'),
    sidebarBackdrop: document.getElementById('sidebarBackdrop'),
    mobileProgressBadge: document.getElementById('mobileProgressBadge')
  };

  // Utility: Fisher-Yates Shuffle
  function shuffleArray(arr) {
    const array = [...arr];
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  // Shuffle Question and its Options safely
  function prepareQuestion(origQ) {
    const qCopy = {
      id: origQ.id,
      question: origQ.question,
      options: []
    };

    // Check if options refer to specific other letters (e.g. "Cả A và B", "Câu a và c")
    const hasMetaLetter = origQ.options.some(opt => {
      const t = opt.text.toLowerCase();
      return /cả\s+[a-d]|câu\s+[a-d]/.test(t);
    });

    // Check if option is "Tất cả các câu trên đều đúng" or "Tất cả đều đúng"
    const allAboveOpt = origQ.options.find(opt => {
      const t = opt.text.toLowerCase();
      return t.includes('tất cả các câu trên') || t.includes('tất cả các đáp án trên') || t.includes('tất cả đều đúng') || t.includes('tất cả đều sai');
    });

    if (hasMetaLetter) {
      // Keep option order for questions where options explicitly refer to "A và B", "a và c"
      qCopy.options = origQ.options.map(opt => ({
        text: opt.text,
        is_correct: opt.is_correct
      }));
    } else if (allAboveOpt && origQ.options.indexOf(allAboveOpt) === origQ.options.length - 1) {
      // If "Tất cả đều đúng" is the last option, shuffle top options (A, B, C) and keep "Tất cả" at the bottom
      const topOpts = origQ.options.slice(0, -1);
      const shuffledTop = shuffleArray(topOpts);
      qCopy.options = [...shuffledTop, allAboveOpt].map(opt => ({
        text: opt.text,
        is_correct: opt.is_correct
      }));
    } else {
      // Standard: shuffle all options completely
      const shuffledOpts = shuffleArray(origQ.options);
      qCopy.options = shuffledOpts.map(opt => ({
        text: opt.text,
        is_correct: opt.is_correct
      }));
    }

    return qCopy;
  }

  // Draw 50 random non-duplicate questions from bank
  function generateRandom50Questions() {
    const pool = state.allQuestions;
    const count = Math.min(TOTAL_EXAM_QUESTIONS, pool.length);
    const selected = shuffleArray(pool).slice(0, count);
    return shuffleArray(selected).map(prepareQuestion);
  }

  // Exam Session Persistence (Tự động lưu và khôi phục khi vô tình tải lại trang)
  function saveCurrentSession() {
    if (state.isSubmitted || state.activeQuestions.length === 0) return;
    try {
      const sessionData = {
        activeQuestions: state.activeQuestions,
        userAnswers: state.userAnswers,
        flagged: Array.from(state.flagged),
        timerSeconds: state.timerSeconds,
        timeSpent: state.timeSpent,
        currentFocusIndex: state.currentFocusIndex,
        viewMode: state.viewMode,
        timestamp: Date.now()
      };
      localStorage.setItem(STORAGE_KEY_SESSION, JSON.stringify(sessionData));
    } catch (e) {}
  }

  function clearCurrentSession() {
    try {
      localStorage.removeItem(STORAGE_KEY_SESSION);
    } catch (e) {}
  }

  function loadCurrentSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_SESSION);
      if (!raw) return false;
      const data = JSON.parse(raw);
      // Kiểm tra tính hợp lệ của phiên thi đã lưu (trong vòng 24 giờ và đủ 50 câu)
      const isRecent = data.timestamp && (Date.now() - data.timestamp < 24 * 60 * 60 * 1000);
      if (isRecent && data.activeQuestions && data.activeQuestions.length === TOTAL_EXAM_QUESTIONS) {
        state.activeQuestions = data.activeQuestions;
        state.userAnswers = data.userAnswers || {};
        state.flagged = new Set(data.flagged || []);
        state.timerSeconds = typeof data.timerSeconds === 'number' ? data.timerSeconds : 60 * 60;
        state.timeSpent = data.timeSpent || 0;
        state.currentFocusIndex = data.currentFocusIndex || 0;
        state.viewMode = data.viewMode || 'list';
        state.isSubmitted = false;
        return true;
      }
    } catch (e) {}
    return false;
  }

  // Initialize or Reset Quiz (Always randomizes next 50 questions)
  function initQuiz() {
    clearCurrentSession();
    clearInterval(state.timerInterval);
    
    state.isSubmitted = false;
    state.userAnswers = {};
    state.flagged.clear();
    state.currentFocusIndex = 0;
    state.activeFilter = 'all';
    state.isTimerPaused = false;
    
    // Always draw a fresh set of 50 random questions and shuffle options
    state.activeQuestions = generateRandom50Questions();

    // Set Timer: 60 minutes
    state.timerSeconds = 60 * 60;
    state.initialTimerSeconds = state.timerSeconds;
    state.timeSpent = 0;
    
    saveCurrentSession();
    startTimer();
    renderUI();
    
    // Hide score banner & filter bar
    if (el.scoreBanner) el.scoreBanner.style.display = 'none';
    if (el.filterBar) el.filterBar.style.display = 'none';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Timer functions
  function startTimer() {
    clearInterval(state.timerInterval);
    updateTimerDisplay();

    state.timerInterval = setInterval(() => {
      if (state.isTimerPaused || state.isSubmitted) return;

      state.timeSpent++;
      state.timerSeconds--;
      if (state.timerSeconds <= 0) {
        state.timerSeconds = 0;
        clearInterval(state.timerInterval);
        updateTimerDisplay();
        alert('Hết thời gian làm bài! Hệ thống tự động nộp bài.');
        submitQuiz(false);
        return;
      }
      if (state.timeSpent % 5 === 0) {
        saveCurrentSession();
      }
      updateTimerDisplay();
    }, 1000);
  }

  function formatTime(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  function updateTimerDisplay() {
    if (!el.timerDisplay) return;
    el.timerDisplay.textContent = formatTime(state.timerSeconds);
    if (state.timerSeconds <= 300) {
      el.timerBox.classList.add('timer-warning');
    } else {
      el.timerBox.classList.remove('timer-warning');
    }
  }

  // Toggle Timer Pause
  function toggleTimerPause() {
    if (state.isSubmitted) return;
    state.isTimerPaused = !state.isTimerPaused;
    if (el.btnToggleTimer) {
      el.btnToggleTimer.textContent = state.isTimerPaused ? 'Tiếp tục' : 'Tạm dừng';
    }
  }

  // Answer selection handler
  function selectAnswer(questionIndex, optionIndex) {
    if (state.isSubmitted) return;

    state.userAnswers[questionIndex] = optionIndex;
    saveCurrentSession();
    updateProgress();
    renderPalette();

    const card = document.getElementById(`q-card-${questionIndex}`);
    if (card) {
      const optionItems = card.querySelectorAll('.option-item');
      optionItems.forEach((item, idx) => {
        if (idx === optionIndex) {
          item.classList.add('selected');
        } else {
          item.classList.remove('selected');
        }
      });
    }
  }

  // Toggle Flag (Đánh dấu xem lại)
  function toggleFlag(questionIndex) {
    if (state.flagged.has(questionIndex)) {
      state.flagged.delete(questionIndex);
    } else {
      state.flagged.add(questionIndex);
    }
    saveCurrentSession();
    
    const card = document.getElementById(`q-card-${questionIndex}`);
    if (card) {
      card.classList.toggle('flagged', state.flagged.has(questionIndex));
      const flagBtn = card.querySelector('.btn-flag');
      if (flagBtn) {
        const isFlagged = state.flagged.has(questionIndex);
        flagBtn.classList.toggle('active', isFlagged);
        flagBtn.textContent = isFlagged ? 'Đã đánh dấu' : 'Đánh dấu';
      }
    }
    renderPalette();
  }

  // Mobile Drawer helpers
  function openMobileSidebar() {
    if (el.quizSidebar) el.quizSidebar.classList.add('drawer-open');
    if (el.sidebarBackdrop) el.sidebarBackdrop.classList.add('active');
  }

  function closeMobileSidebar() {
    if (el.quizSidebar) el.quizSidebar.classList.remove('drawer-open');
    if (el.sidebarBackdrop) el.sidebarBackdrop.classList.remove('active');
  }

  // Progress Bar
  function updateProgress() {
    const total = state.activeQuestions.length;
    const answered = Object.keys(state.userAnswers).length;
    const pct = total > 0 ? Math.round((answered / total) * 100) : 0;

    if (el.progressCount) el.progressCount.textContent = `${answered}/${total}`;
    if (el.progressBar) el.progressBar.style.width = `${pct}%`;
    if (el.answeredCountBadge) el.answeredCountBadge.textContent = `${answered}/${total}`;
    if (el.mobileProgressBadge) el.mobileProgressBadge.textContent = `${answered}/${total}`;
  }

  // Render Palette (Question Grid)
  function renderPalette() {
    if (!el.paletteGrid) return;
    el.paletteGrid.innerHTML = '';

    state.activeQuestions.forEach((q, idx) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'palette-btn';
      btn.textContent = idx + 1;
      btn.setAttribute('aria-label', `Câu hỏi ${idx + 1}`);

      const isAnswered = state.userAnswers[idx] !== undefined;
      const isFlagged = state.flagged.has(idx);

      if (state.isSubmitted) {
        const userChoice = state.userAnswers[idx];
        const correctChoice = q.options.findIndex(o => o.is_correct);
        if (userChoice === correctChoice) {
          btn.classList.add('result-correct');
        } else {
          btn.classList.add('result-wrong');
        }
      } else {
        if (isAnswered) btn.classList.add('answered');
      }

      if (isFlagged) btn.classList.add('flagged');
      if (state.viewMode === 'focus' && state.currentFocusIndex === idx) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => {
        closeMobileSidebar();
        if (state.viewMode === 'focus') {
          state.currentFocusIndex = idx;
          renderUI();
        } else {
          const card = document.getElementById(`q-card-${idx}`);
          if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            card.style.transform = 'scale(1.01)';
            setTimeout(() => { card.style.transform = ''; }, 300);
          }
        }
      });

      el.paletteGrid.appendChild(btn);
    });
  }

  // Render Single Question Card (No chapter tag, no emojis)
  function createQuestionCardHTML(q, idx) {
    const letters = ['A', 'B', 'C', 'D', 'E'];
    const userChoice = state.userAnswers[idx];
    const isFlagged = state.flagged.has(idx);
    
    let statusClass = '';
    let feedbackHTML = '';

    const showAnswer = state.isSubmitted;
    const correctIdx = q.options.findIndex(o => o.is_correct);

    if (showAnswer && userChoice !== undefined) {
      if (userChoice === correctIdx) {
        statusClass = 'status-correct';
        feedbackHTML = `
          <div class="answer-feedback feedback-correct">
            <span>Chính xác. Bạn đã chọn đúng đáp án.</span>
          </div>`;
      } else {
        statusClass = 'status-wrong';
        feedbackHTML = `
          <div class="answer-feedback feedback-wrong">
            <span>Chưa chính xác. Đáp án đúng là <strong>${letters[correctIdx]}. ${escapeHTML(q.options[correctIdx].text)}</strong></span>
          </div>`;
      }
    } else if (showAnswer && state.isSubmitted && userChoice === undefined) {
      statusClass = 'status-wrong';
      feedbackHTML = `
        <div class="answer-feedback feedback-wrong">
          <span>Chưa làm. Đáp án đúng là <strong>${letters[correctIdx]}. ${escapeHTML(q.options[correctIdx].text)}</strong></span>
        </div>`;
    }

    const optionsHTML = q.options.map((opt, optIdx) => {
      let optClass = 'option-item';
      if (userChoice === optIdx) optClass += ' selected';

      if (showAnswer) {
        if (optIdx === correctIdx) {
          optClass += ' is-correct-answer';
        } else if (userChoice === optIdx && userChoice !== correctIdx) {
          optClass += ' is-wrong-answer';
        }
      }

      return `
        <div class="${optClass}" data-q="${idx}" data-opt="${optIdx}">
          <div class="option-letter">${letters[optIdx]}</div>
          <div class="option-text">${escapeHTML(opt.text)}</div>
        </div>
      `;
    }).join('');

    return `
      <div class="question-card ${isFlagged ? 'flagged' : ''} ${statusClass}" id="q-card-${idx}">
        <div class="question-header">
          <div class="question-meta">
            <span class="question-num-tag">Câu ${idx + 1}</span>
          </div>
          <div class="question-actions">
            <button type="button" class="btn-flag ${isFlagged ? 'active' : ''}" data-flag="${idx}">
              ${isFlagged ? 'Đã đánh dấu' : 'Đánh dấu'}
            </button>
          </div>
        </div>
        <div class="question-title">${escapeHTML(q.question)}</div>
        <div class="options-list">
          ${optionsHTML}
        </div>
        ${feedbackHTML}
      </div>
    `;
  }

  // Render individual card replacement
  function renderQuestionCard(idx) {
    const card = document.getElementById(`q-card-${idx}`);
    if (!card) return;
    const q = state.activeQuestions[idx];
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = createQuestionCardHTML(q, idx);
    const newCard = tempDiv.firstElementChild;
    card.parentNode.replaceChild(newCard, card);
    bindCardEvents(newCard);
  }

  // Helper to bind events for cards
  function bindCardEvents(parent) {
    const optionItems = parent.querySelectorAll('.option-item');
    optionItems.forEach(item => {
      item.addEventListener('click', () => {
        const qIdx = parseInt(item.getAttribute('data-q'), 10);
        const optIdx = parseInt(item.getAttribute('data-opt'), 10);
        selectAnswer(qIdx, optIdx);
      });
    });

    const flagBtns = parent.querySelectorAll('.btn-flag');
    flagBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const qIdx = parseInt(btn.getAttribute('data-flag'), 10);
        toggleFlag(qIdx);
      });
    });
  }

  // Render UI
  function renderUI() {
    updateProgress();
    renderPalette();

    if (!el.questionsContainer) return;
    el.questionsContainer.innerHTML = '';

    if (state.viewMode === 'list') {
      const cardsHTML = state.activeQuestions.map((q, idx) => {
        if (state.isSubmitted && state.activeFilter !== 'all') {
          const userChoice = state.userAnswers[idx];
          const correctIdx = q.options.findIndex(o => o.is_correct);
          if (state.activeFilter === 'correct' && userChoice !== correctIdx) return '';
          if (state.activeFilter === 'wrong' && (userChoice === correctIdx || userChoice === undefined)) return '';
          if (state.activeFilter === 'unanswered' && userChoice !== undefined) return '';
        }
        return createQuestionCardHTML(q, idx);
      }).join('');

      el.questionsContainer.innerHTML = cardsHTML || '<div style="padding: 2rem; text-align: center; color: var(--text-muted);">Không có câu hỏi nào theo bộ lọc này.</div>';
      bindCardEvents(el.questionsContainer);
    } else {
      const idx = state.currentFocusIndex;
      const q = state.activeQuestions[idx];
      if (!q) return;

      const singleCardHTML = createQuestionCardHTML(q, idx);
      const total = state.activeQuestions.length;

      const navHTML = `
        <div class="focus-nav">
          <button type="button" class="btn btn-secondary" id="btnPrevFocus" ${idx === 0 ? 'disabled' : ''}>
            Câu trước
          </button>
          <span style="font-weight: 600; color: var(--text-muted);">
            Câu ${idx + 1} / ${total}
          </span>
          <button type="button" class="btn btn-primary" id="btnNextFocus" ${idx === total - 1 ? 'disabled' : ''}>
            Câu tiếp
          </button>
        </div>
      `;

      el.questionsContainer.innerHTML = singleCardHTML + navHTML;
      bindCardEvents(el.questionsContainer);

      const btnPrev = document.getElementById('btnPrevFocus');
      const btnNext = document.getElementById('btnNextFocus');

      if (btnPrev) {
        btnPrev.addEventListener('click', () => {
          if (state.currentFocusIndex > 0) {
            state.currentFocusIndex--;
            renderUI();
          }
        });
      }
      if (btnNext) {
        btnNext.addEventListener('click', () => {
          if (state.currentFocusIndex < total - 1) {
            state.currentFocusIndex++;
            renderUI();
          }
        });
      }
    }
  }

  // Submit Quiz & Calculate Score (50/50 = 10.0 points, 0.2đ/câu)
  function submitQuiz(confirmPrompt = true) {
    if (state.isSubmitted) return;

    const total = state.activeQuestions.length;
    const answeredCount = Object.keys(state.userAnswers).length;
    const unansweredCount = total - answeredCount;

    if (confirmPrompt && unansweredCount > 0) {
      const confirmSubmit = confirm(
        `Bạn vẫn còn ${unansweredCount} câu chưa trả lời. Bạn có chắc chắn muốn nộp bài không?`
      );
      if (!confirmSubmit) return;
    }

    clearInterval(state.timerInterval);
    state.isSubmitted = true;
    clearCurrentSession();

    // Calculate score: exactly 50/50 = 10.0 points
    let correctCount = 0;
    state.activeQuestions.forEach((q, idx) => {
      const userChoice = state.userAnswers[idx];
      const correctIdx = q.options.findIndex(o => o.is_correct);
      if (userChoice === correctIdx) {
        correctCount++;
      }
    });

    const wrongCount = answeredCount - correctCount;
    const rawScore = total > 0 ? (correctCount / total) * 10 : 0;
    const finalScore = Math.round(rawScore * 100) / 100;

    // Grading
    let grade = 'Cần cố gắng';
    let gradeColor = 'var(--danger)';
    if (finalScore >= 9.0) {
      grade = 'Xuất sắc';
      gradeColor = 'var(--success)';
    } else if (finalScore >= 8.0) {
      grade = 'Giỏi';
      gradeColor = 'var(--primary)';
    } else if (finalScore >= 6.5) {
      grade = 'Khá';
      gradeColor = 'var(--secondary)';
    } else if (finalScore >= 5.0) {
      grade = 'Trung bình';
      gradeColor = 'var(--warning)';
    }

    // Display Score Banner
    if (el.scoreVal) el.scoreVal.textContent = finalScore.toFixed(1);
    if (el.scoreGrade) {
      el.scoreGrade.textContent = grade;
      el.scoreGrade.style.color = gradeColor;
    }
    if (el.statCorrect) el.statCorrect.textContent = `${correctCount}/${total}`;
    if (el.statWrong) el.statWrong.textContent = `${wrongCount}`;
    if (el.statUnanswered) el.statUnanswered.textContent = `${unansweredCount}`;
    if (el.statTime) el.statTime.textContent = formatTime(state.timeSpent);

    if (el.scoreBanner) el.scoreBanner.style.display = 'flex';
    if (el.filterBar) el.filterBar.style.display = 'flex';

    // Save to History
    saveHistory({
      date: new Date().toLocaleString('vi-VN'),
      score: finalScore,
      correct: correctCount,
      total: total,
      time: formatTime(state.timeSpent)
    });

    renderUI();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // History Management
  function loadHistory() {
    try {
      const data = localStorage.getItem('xhh_quiz_history');
      state.history = data ? JSON.parse(data) : [];
    } catch (e) {
      state.history = [];
    }
  }

  function saveHistory(record) {
    state.history.unshift(record);
    if (state.history.length > 50) state.history.pop();
    try {
      localStorage.setItem('xhh_quiz_history', JSON.stringify(state.history));
    } catch (e) {}
  }

  function renderHistoryTable() {
    if (!el.historyTableBody) return;
    if (state.history.length === 0) {
      el.historyTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Chưa có lịch sử làm bài nào.</td></tr>`;
      return;
    }

    el.historyTableBody.innerHTML = state.history.map((h, i) => `
      <tr>
        <td>${i + 1}</td>
        <td>${h.date}</td>
        <td><strong style="color: var(--primary);">${h.score.toFixed(1)} / 10</strong></td>
        <td>${h.correct}/${h.total} câu</td>
        <td>${h.time}</td>
      </tr>
    `).join('');
  }

  // Search Bank
  function handleSearch(keyword) {
    if (!el.searchResults) return;
    const term = keyword.trim().toLowerCase();
    if (!term) {
      el.searchResults.innerHTML = '<div style="color: var(--text-muted); text-align: center; padding: 1rem;">Nhập từ khóa để tra cứu câu hỏi...</div>';
      return;
    }

    const matches = state.allQuestions.filter(q => 
      q.question.toLowerCase().includes(term) || 
      q.options.some(o => o.text.toLowerCase().includes(term))
    );

    if (matches.length === 0) {
      el.searchResults.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 1rem;">Không tìm thấy câu hỏi nào phù hợp với "${escapeHTML(keyword)}".</div>`;
      return;
    }

    const letters = ['A', 'B', 'C', 'D', 'E'];
    el.searchResults.innerHTML = matches.slice(0, 30).map((q, idx) => {
      const correctOptIdx = q.options.findIndex(o => o.is_correct);
      const correctText = correctOptIdx >= 0 ? `${letters[correctOptIdx]}. ${q.options[correctOptIdx].text}` : 'Chưa xác định';

      return `
        <div class="search-item">
          <div class="search-item-q">${idx + 1}. ${escapeHTML(q.question)}</div>
          <div class="search-item-a">Đáp án đúng: ${escapeHTML(correctText)}</div>
        </div>
      `;
    }).join('');
  }

  // Escape HTML helper
  function escapeHTML(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Theme Settings
  function initTheme() {
    const savedTheme = localStorage.getItem('xhh_theme') || 'light';
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('xhh_theme', theme);
    if (el.themeIcon) {
      if (theme === 'dark') {
        // Sun icon
        el.themeIcon.innerHTML = `
          <circle cx="12" cy="12" r="5"></circle>
          <line x1="12" y1="1" x2="12" y2="3"></line>
          <line x1="12" y1="21" x2="12" y2="23"></line>
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
          <line x1="1" y1="12" x2="3" y2="12"></line>
          <line x1="21" y1="12" x2="23" y2="12"></line>
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
        `;
      } else {
        // Moon icon
        el.themeIcon.innerHTML = `
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
        `;
      }
    }
  }

  function toggleTheme() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    applyTheme(next);
  }

  // Event Listeners
  function setupEventListeners() {
    // Retake: "Làm lại bài" -> generates next 50 random questions & shuffles options
    if (el.btnRetake) {
      el.btnRetake.addEventListener('click', () => {
        initQuiz();
      });
    }

    // Submit Quiz Button
    if (el.btnSubmit) {
      el.btnSubmit.addEventListener('click', () => {
        submitQuiz(true);
      });
    }

    // Timer Toggle Button
    if (el.btnToggleTimer) {
      el.btnToggleTimer.addEventListener('click', toggleTimerPause);
    }

    // View Mode Toggle (List vs Focus)
    if (el.btnViewList) {
      el.btnViewList.addEventListener('click', () => {
        state.viewMode = 'list';
        el.btnViewList.classList.add('active');
        el.btnViewFocus.classList.remove('active');
        renderUI();
      });
    }
    if (el.btnViewFocus) {
      el.btnViewFocus.addEventListener('click', () => {
        state.viewMode = 'focus';
        el.btnViewFocus.classList.add('active');
        el.btnViewList.classList.remove('active');
        renderUI();
      });
    }

    // Filter Buttons (Review after submit)
    if (el.filterBar) {
      const filterBtns = el.filterBar.querySelectorAll('.filter-btn');
      filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          filterBtns.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          state.activeFilter = btn.getAttribute('data-filter');
          renderUI();
        });
      });
    }

    // Theme
    if (el.themeToggle) el.themeToggle.addEventListener('click', toggleTheme);

    // Mobile Drawer
    if (el.btnMobilePalette) el.btnMobilePalette.addEventListener('click', openMobileSidebar);
    if (el.btnCloseSidebar) el.btnCloseSidebar.addEventListener('click', closeMobileSidebar);
    if (el.sidebarBackdrop) el.sidebarBackdrop.addEventListener('click', closeMobileSidebar);

    // History Modal
    if (el.btnHistory) {
      el.btnHistory.addEventListener('click', () => {
        renderHistoryTable();
        el.historyModal.classList.add('active');
      });
    }
    if (el.btnCloseHistory) {
      el.btnCloseHistory.addEventListener('click', () => {
        el.historyModal.classList.remove('active');
      });
    }
    if (el.btnClearHistory) {
      el.btnClearHistory.addEventListener('click', () => {
        if (confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử làm bài không?')) {
          state.history = [];
          localStorage.removeItem('xhh_quiz_history');
          renderHistoryTable();
        }
      });
    }

    // Search Bank Modal
    if (el.btnSearchModal) {
      el.btnSearchModal.addEventListener('click', () => {
        el.searchModal.classList.add('active');
        if (el.searchInput) {
          el.searchInput.focus();
          handleSearch(el.searchInput.value);
        }
      });
    }
    if (el.btnCloseSearch) {
      el.btnCloseSearch.addEventListener('click', () => {
        el.searchModal.classList.remove('active');
      });
    }
    if (el.searchInput) {
      el.searchInput.addEventListener('input', (e) => {
        handleSearch(e.target.value);
      });
    }

    // Close modals on overlay click
    [el.historyModal, el.searchModal].forEach(modal => {
      if (modal) {
        modal.addEventListener('click', (e) => {
          if (e.target === modal) modal.classList.remove('active');
        });
      }
    });

    // Keyboard navigation in Focus mode
    window.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

      if (state.viewMode === 'focus') {
        const total = state.activeQuestions.length;
        if (e.key === 'ArrowLeft' && state.currentFocusIndex > 0) {
          state.currentFocusIndex--;
          renderUI();
        } else if (e.key === 'ArrowRight' && state.currentFocusIndex < total - 1) {
          state.currentFocusIndex++;
          renderUI();
        } else if (['1', '2', '3', '4'].includes(e.key)) {
          const optIdx = parseInt(e.key, 10) - 1;
          selectAnswer(state.currentFocusIndex, optIdx);
        } else if (['a', 'b', 'c', 'd'].includes(e.key.toLowerCase())) {
          const map = { a: 0, b: 1, c: 2, d: 3 };
          selectAnswer(state.currentFocusIndex, map[e.key.toLowerCase()]);
        }
      }
    });

    // Cảnh báo khi người dùng vô tình reload hoặc rời trang trong lúc đang làm bài
    window.addEventListener('beforeunload', (e) => {
      if (!state.isSubmitted && state.activeQuestions.length > 0) {
        saveCurrentSession();
        // Chỉ hiển thị hộp thoại cảnh báo nếu người dùng đã bắt đầu chọn đáp án
        if (Object.keys(state.userAnswers).length > 0) {
          e.preventDefault();
          e.returnValue = '';
        }
      }
    });
  }

  // Application Startup
  document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadHistory();
    setupEventListeners();

    // Khôi phục phiên làm bài nếu có (tránh mất bài khi vô tình F5/reload)
    const hasSession = loadCurrentSession();
    if (hasSession) {
      startTimer();
      renderUI();
    } else {
      initQuiz();
    }
  });

})();
