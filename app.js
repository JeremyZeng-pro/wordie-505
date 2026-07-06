const catalog = window.WORDIE_CATALOG;
const characters = window.WORDIE_CHARACTERS;
const core = window.WORDIE_CORE;
const app = document.querySelector("#app");
const keyCount = document.querySelector("#key-count");
const toast = document.querySelector("#toast");
const STORAGE_KEY = "wordie_offline_phonics_v2";
const LEGACY_STORAGE_KEY = "wordie_offline_full_v1";

let state = loadState();
let routeState = { name: "home" };
let courseQuery = "";
let lessonIndex = 0;
let lessonWords = [];
let learnPosition = 0;
let quiz = [];
let quizIndex = 0;
let quizAnswers = [];
let selectedAnswer = "";
let spellingAnswer = "";
let mediaRecorder = null;
let mediaStream = null;
let recordingChunks = [];
let recordingTimer = null;
let recordingWordId = null;
let recordingCallback = null;
const recordingUrls = {};
let reviewQueue = [];
let reviewIndex = 0;
let reviewRevealed = false;

function loadState() {
  try {
    const current = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (current) return core.normalizeState(current);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (!legacy) return core.defaultState();
    return core.normalizeState({ learned: legacy.learned || [], voiceAttempts: legacy.voiceAttempts || [], keys: legacy.keys || 0, starDust: legacy.starDust || 0, collection: legacy.collection || [] });
  }
  catch { return core.defaultState(); }
}
function saveState(next = state) {
  state = core.normalizeState(next);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  keyCount.textContent = state.keys;
  return state;
}
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 1900);
}
function stopActiveRecording() {
  clearTimeout(recordingTimer);
  if (mediaRecorder && mediaRecorder.state === "recording") mediaRecorder.stop();
  if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
  mediaStream = null;
}
function setActiveNav(name) {
  document.querySelectorAll(".bottom-nav [data-route]").forEach(button => button.classList.toggle("active", button.dataset.route === name));
}
function navigate(name, payload = {}) {
  if (routeState.name !== name) stopActiveRecording();
  routeState = Object.assign({ name }, payload);
  setActiveNav(["learn", "quiz", "word"].includes(name) ? "course" : name);
  const views = { home: renderHome, course: renderCourse, learn: renderLearn, quiz: renderQuiz, word: renderWord, review: renderReview, box: renderBox, collection: renderCollection, growth: renderGrowth };
  (views[name] || renderHome)();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function audioPath(id) { return core.audioPath(id); }
function playWord(id) {
  const player = new Audio(audioPath(id));
  player.play().catch(() => showToast("无法播放发音，请使用一键启动版打开"));
}
function playSentence(id) {
  const filename = (`000${id}`).slice(-3);
  const player = new Audio(`assets/sentences/${filename}.m4a`);
  player.play().catch(() => showToast("无法播放例句，请使用一键启动版打开"));
}
function renderExample(word) {
  const key = `sentence-${word.id}`;
  const recording = recordingUrls[key];
  return `<div class="example-block"><div class="example-row"><p class="example">${word.example}</p><button class="sentence-speaker" data-action="play-sentence" data-id="${word.id}" aria-label="朗读例句">🔊</button></div><p class="example-cn">${word.exampleCn}</p><button class="sentence-record" data-action="record-sentence" data-id="${word.id}">${recordingWordId === key ? "⏹ 正在录制整句…" : recording ? "🎙️ 重新跟读例句" : "🎙️ 跟读例句"}</button>${recording ? `<audio class="sentence-playback" controls src="${recording}"></audio>` : ""}</div>`;
}
function progressPercent() { return Math.round(state.learned.length / catalog.length * 100); }
function lessonSize() { return core.normalizeLessonSize(state.lessonSize); }

function renderHome() {
  const active = state.activeLesson;
  const words = core.getLesson(catalog, active, lessonSize());
  const meta = core.lessonMeta(catalog, active, lessonSize());
  const learned = words.filter(word => state.learned.includes(word.id)).length;
  const completed = state.completedLessons.includes(active);
  const totalLessons = core.lessonCount(catalog, lessonSize());
  const minutes = Math.max(10, lessonSize() * 2);
  const dueCount = core.dueReviewIds(state).length;
  app.innerHTML = `
    <section class="hero"><div class="eyebrow" style="color:#fff">LESSON ${active + 1} / ${totalLessons}</div><h1>${completed ? "本课已完成，继续巩固吧！" : `学${words.length}个词，赢一把盲盒钥匙`}</h1><p>${meta.title}：${words.map(word => word.word).join(" · ")}</p><button class="primary" data-action="start-home">${completed ? "复习本课" : learned ? "继续本课" : "开始本课"}</button><div class="mascot"></div></section>
    <section class="section grid-2"><div class="stat-card"><small>完整词库</small><strong>505</strong><small>共${totalLessons}课</small></div><div class="stat-card"><small>本课进度</small><strong>${learned}/${words.length}</strong><small>学习后才能开盒</small></div></section>
    <section class="section panel"><div style="display:flex;justify-content:space-between"><b>当前课程</b><span class="tag">约${minutes}分钟</span></div><div class="progress-track" style="margin:14px 0 9px"><div class="progress-fill" style="width:${Math.round(learned / words.length * 100)}%"></div></div><small class="muted">${words.length}个单词 · 5种检测 · 离线录音跟读</small></section>
    <button class="section panel wide course-entry" data-route="course"><span><b>查看全部505词课程</b><small class="muted" style="display:block;margin-top:5px">总进度 ${progressPercent()}% · 可搜索任意单词</small></span><span class="arrow">›</span></button>
    <button class="section review-entry wide" data-action="start-review"><span><b>🧠 今日待复习 ${dueCount} 词</b><small>${dueCount ? "按遗忘曲线及时巩固" : "今天的复习已完成"}</small></span><span>›</span></button>
    <section class="section"><h2>任务路线</h2><div class="mission"><span class="icon">📚</span><div><b>1. 学习${words.length}个新词</b><p>大图联想、离线发音、例句和记忆梗</p></div></div><div class="mission"><span class="icon">🎙️</span><div><b>2. 离线录音跟读</b><p>录音只留在本地，可立即回放</p></div></div><div class="mission"><span class="icon">🎁</span><div><b>3. 检测达标开盲盒</b><p>达到80分后获得学习钥匙</p></div></div></section>`;
}

function lessonRows() {
  return Array.from({ length: core.lessonCount(catalog, lessonSize()) }, (_, index) => {
    const meta = core.lessonMeta(catalog, index, lessonSize());
    const learned = meta.wordIds.filter(id => state.learned.includes(id)).length;
    return Object.assign(meta, { learned, locked: index > state.currentLesson, completed: state.completedLessons.includes(index), active: index === state.activeLesson });
  });
}
function renderCourse() {
  const rows = lessonRows();
  app.innerHTML = `<div class="eyebrow">FULL COURSE · 505 WORDS</div><h1 class="page-title">完整词汇课程</h1><p class="muted">共${rows.length}课，每次${lessonSize()}词。完成当前课后解锁下一课。</p><div class="panel section"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><b>${state.learned.length}/505 已学习</b><b>${progressPercent()}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${progressPercent()}%"></div></div></div><div class="search-box section"><span>⌕</span><input id="course-search" placeholder="搜索英文或中文释义" value="${courseQuery}" /></div><div id="course-content" class="section">${courseQuery ? renderSearchMarkup(core.search(catalog, courseQuery)) : renderLessonsMarkup(rows)}</div>`;
}
function renderSearchMarkup(results) {
  if (!results.length) return `<div class="empty panel">没有找到相关词汇</div>`;
  return `<h2>搜索结果（最多50条）</h2><div class="result-list">${results.map(word => `<button class="word-result wide" data-action="open-word" data-id="${word.id}"><span style="font-size:30px">${word.icon}</span><span class="result-main"><b>${word.word}</b><small>${word.meaning} · ${word.phonetic}</small></span><span class="result-arrow">›</span></button>`).join("")}</div>`;
}
function renderLessonsMarkup(rows) {
  return `<h2>全部${rows.length}课</h2><div class="lesson-list">${rows.map(row => `<button class="lesson-card ${row.locked ? "locked" : ""} ${row.active ? "active" : ""}" data-action="open-lesson" data-index="${row.index}"><span class="lesson-icon">${row.locked ? "🔒" : row.completed ? "✅" : row.icon}</span><span class="lesson-main"><b>${row.title}</b><small>${row.subtitle}</small><span class="lesson-status">${row.completed ? "已完成，可复习" : row.locked ? "待解锁" : `${row.learned}/${row.wordIds.length} 已学习`}</span></span><span class="result-arrow">›</span></button>`).join("")}</div>`;
}

function startLesson(index) {
  if (index > state.currentLesson) return showToast("完成上一课后解锁");
  state.activeLesson = index;
  saveState();
  lessonIndex = index;
  lessonWords = core.getLesson(catalog, index, lessonSize());
  const first = lessonWords.findIndex(word => !state.learned.includes(word.id));
  learnPosition = first < 0 ? 0 : first;
  navigate("learn", { lesson: index });
}
function renderScene(word) {
  if (word.image) return `<div class="scene scene-image"><img class="word-scene-image" src="${word.image}" alt="${word.word}词义情境图" loading="eager"><div class="scene-caption"><strong>${word.art.sceneCaption}</strong><span>${word.example}</span></div></div>`;
  return `<div class="scene scene-${word.art.style}"><span class="scene-sticker">${word.art.sticker}</span><span class="scene-note">${word.art.note}</span><div class="scene-stage scene-stage-${word.art.visualType}"><span class="scene-role">${word.art.leftEmoji}</span><b class="scene-arrow">${word.art.arrow}</b><span class="scene-role scene-role-main">${word.art.rightEmoji}</span></div><div class="scene-caption"><strong>${word.art.sceneCaption}</strong><span>${word.art.bubble}</span></div></div>`;
}
function renderLearn() {
  if (!lessonWords.length) { lessonIndex = state.activeLesson; lessonWords = core.getLesson(catalog, lessonIndex, lessonSize()); }
  if (learnPosition >= lessonWords.length) {
    app.innerHTML = `<div class="panel result-card"><div style="font-size:68px">🎯</div><h1>${lessonWords.length}个词已学习</h1><p class="muted">接下来完成五种检测。达到80分即可获得钥匙。</p><button class="primary wide" data-action="start-quiz">开始综合检测</button></div>`;
    return;
  }
  const word = lessonWords[learnPosition];
  const voiceDone = state.voiceAttempts.includes(word.id);
  const recordingUrl = recordingUrls[word.id];
  app.innerHTML = `<div class="eyebrow">第${lessonIndex + 1}课 · 新词 ${learnPosition + 1}/${lessonWords.length}</div><div class="step-dots">${lessonWords.map((_, index) => `<i class="${index <= learnPosition ? "active" : ""}"></i>`).join("")}</div><article class="learning-card"><span class="tag">${word.pos} · 拼写 ${word.focus}</span><h1 class="word-title">${word.word}</h1><div class="phonetic">${word.phonetic}</div>${renderScene(word)}<div class="meaning">${word.meaning}</div>${renderExample(word)}<div class="tip">💡 ${word.tip}</div></article><div class="button-row learn-actions"><button class="secondary" data-action="play-word" data-id="${word.id}">🔊 听发音</button><button class="secondary" data-action="record-word" data-id="${word.id}">${recordingWordId === word.id && mediaRecorder?.state === "recording" ? "⏹ 正在录音…" : voiceDone ? "✓ 重新录音" : "🎙️ 跟读录音"}</button><button class="primary" data-action="remember-word" ${voiceDone ? "" : "disabled"}>我记住了</button></div>${recordingUrl ? `<div class="record-panel"><div class="record-status">你的离线录音（未上传）</div><audio controls src="${recordingUrl}"></audio></div>` : `<div class="record-panel"><div class="record-status">首次点击“跟读录音”时，浏览器会请求麦克风权限。</div></div>`}`;
}

async function recordWord(wordId, callback, duration = 2600) {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
    showToast("当前打开方式不支持录音，请使用一键启动版");
    return;
  }
  try {
    stopActiveRecording();
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
    recordingChunks = [];
    recordingWordId = wordId;
    recordingCallback = callback || null;
    mediaRecorder = new MediaRecorder(mediaStream);
    mediaRecorder.ondataavailable = event => { if (event.data.size) recordingChunks.push(event.data); };
    mediaRecorder.onstop = () => {
      const blob = new Blob(recordingChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      if (recordingUrls[wordId]) URL.revokeObjectURL(recordingUrls[wordId]);
      recordingUrls[wordId] = URL.createObjectURL(blob);
      if (typeof wordId === "number") state.voiceAttempts = core.addUnique(state.voiceAttempts, wordId);
      saveState();
      if (mediaStream) mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
      recordingWordId = null;
      const done = recordingCallback;
      recordingCallback = null;
      showToast("录音完成，可立即回放");
      if (done) done(); else if (routeState.name === "word") renderWord(); else renderLearn();
    };
    mediaRecorder.start();
    if (routeState.name === "learn") renderLearn(); else renderQuiz();
    recordingTimer = setTimeout(() => { if (mediaRecorder?.state === "recording") mediaRecorder.stop(); }, duration);
  } catch (error) {
    recordingWordId = null;
    showToast(error.name === "NotAllowedError" ? "请在浏览器设置中允许麦克风" : "无法启动录音，请检查麦克风");
  }
}
function recordSentence(wordId) {
  playSentence(wordId);
  return recordWord(`sentence-${wordId}`, null, 6500);
}

function startQuiz() {
  quiz = core.buildQuiz(catalog, lessonIndex, lessonSize());
  quizIndex = 0; quizAnswers = []; selectedAnswer = ""; spellingAnswer = "";
  navigate("quiz", { lesson: lessonIndex });
}
function renderQuiz() {
  if (quizIndex >= quiz.length) return renderQuizResult();
  const item = quiz[quizIndex];
  const word = catalog.find(entry => entry.id === item.wordId);
  app.innerHTML = `<div class="eyebrow">第${lessonIndex + 1}课 · 综合检测 ${quizIndex + 1}/5</div><div class="progress-track" style="margin:14px 0 24px"><div class="progress-fill" style="width:${(quizIndex + 1) * 20}%"></div></div><article class="quiz-card"><span class="tag">${item.label}</span><h2>${item.prompt}</h2>${item.type === "audio" ? `<button class="secondary" data-action="play-word" data-id="${item.wordId}">🔊 播放发音</button>` : ""}${item.options ? `<div class="options">${item.options.map((option, index) => `<button class="option ${selectedAnswer === option ? "selected" : ""}" data-action="select-option" data-index="${index}">${option}</button>`).join("")}</div>` : ""}${item.type === "spelling" ? `<input id="spelling-input" class="spell-input" placeholder="输入英文单词" value="${spellingAnswer}" autocomplete="off" />` : ""}${item.type === "voice" ? `${renderScene(word)}<div class="button-row"><button class="secondary" data-action="play-word" data-id="${item.wordId}">🔊 听一遍</button><button class="primary" data-action="record-quiz" data-id="${item.wordId}">${recordingWordId === item.wordId ? "正在录音…" : "🎙️ 开始跟读"}</button></div>${recordingUrls[item.wordId] ? `<div class="record-panel"><div class="record-status">你的离线录音</div><audio controls src="${recordingUrls[item.wordId]}"></audio></div>` : ""}` : `<button class="primary wide" data-action="submit-answer">确认答案</button>`}</article>`;
}
function commitAnswer(value) {
  const item = quiz[quizIndex];
  quizAnswers.push({ index: quizIndex, correct: String(value).toLowerCase() === String(item.answer).toLowerCase() });
  quizIndex += 1; selectedAnswer = ""; spellingAnswer = ""; renderQuiz();
}
function renderQuizResult() {
  const correct = quizAnswers.filter(answer => answer.correct).length;
  const score = correct * 20;
  const previousRewarded = state.rewardedLessons.includes(lessonIndex);
  state = core.finishLesson(state, { score, voiceCompleted: quizAnswers.some(answer => answer.index === 4 && answer.correct), lessonIndex, lessonWordIds: lessonWords.map(word => word.id), totalLessons: core.lessonCount(catalog, lessonSize()) });
  saveState();
  const passed = score >= 80;
  const rewarded = !previousRewarded && state.rewardedLessons.includes(lessonIndex);
  app.innerHTML = `<div class="panel result-card"><div style="font-size:64px">${passed ? "🎉" : "🧩"}</div><h1>${passed ? "检测达标！" : "还差一点，来次短补练"}</h1><div class="result-score">${score}</div><p class="${passed ? "success" : "warning"}">${passed ? rewarded ? "学习钥匙＋1。它来自你完成的学习。" : "本课钥匙已领取，成绩已更新。" : `答对${correct}/5，重新检测会帮助巩固。`}</p><div class="button-row" style="justify-content:center;margin-top:18px"><button class="primary" data-action="result-next">${passed ? "去开盲盒" : "重新检测"}</button><button class="ghost" data-route="home">返回首页</button></div></div>`;
}

function renderWord() {
  const word = catalog.find(item => item.id === Number(routeState.id));
  if (!word) return navigate("course");
  app.innerHTML = `<div class="eyebrow">WORD #${(`000${word.id}`).slice(-3)}</div><article class="learning-card"><span class="tag">${word.pos} · 拼写 ${word.focus}</span><h1 class="word-title">${word.word}</h1><div class="phonetic">${word.phonetic}</div>${renderScene(word)}<div class="meaning">${word.meaning}</div>${renderExample(word)}<div class="tip">💡 ${word.tip}</div><p class="muted" style="font-size:11px;margin-top:14px">词表原文：${word.raw} · 自然拼读分组：${word.phonicsGroup}</p></article><div class="button-row learn-actions"><button class="secondary wide" data-action="play-word" data-id="${word.id}">🔊 播放离线发音</button><button class="ghost wide" data-route="course">返回课程</button></div>`;
}
function startReview() {
  reviewQueue = core.dueReviewIds(state).map(id => catalog.find(word => word.id === id)).filter(Boolean).slice(0, 20);
  reviewIndex = 0;
  reviewRevealed = false;
  if (!reviewQueue.length) return showToast("今天的复习已经完成");
  navigate("review");
}
function renderReview() {
  if (reviewIndex >= reviewQueue.length) {
    app.innerHTML = `<div class="panel result-card"><div style="font-size:68px">🧠</div><h1>今日复习完成</h1><p class="muted">记忆会在一次次主动回想中变牢。</p><button class="primary wide" data-route="home">返回首页</button></div>`;
    return;
  }
  const word = reviewQueue[reviewIndex];
  const review = state.reviews[word.id] || { stage: 0 };
  app.innerHTML = `<div class="eyebrow">间隔复习 ${reviewIndex + 1}/${reviewQueue.length} · 第${review.stage + 1}轮</div><article class="review-card"><span class="tag">先回想，再揭晓</span><h2>${word.meaning}</h2><p class="muted">请说出英文单词，并尝试读出例句。</p>${reviewRevealed ? `<h1 class="word-title">${word.word}</h1><div class="phonetic">${word.phonetic}</div>${renderScene(word)}${renderExample(word)}<div class="review-actions"><button class="review-hard" data-action="grade-review" data-result="hard">还不熟 · 10分钟后再来</button><button class="review-good" data-action="grade-review" data-result="good">记住了 · 按计划延后</button></div>` : `<button class="primary wide reveal-answer" data-action="reveal-review">查看答案</button>`}</article>`;
}
function renderBox() {
  app.innerHTML = `<div class="eyebrow">WORDIE BLIND BOX</div><h1 class="page-title">努力兑换惊喜</h1><p class="muted">只有完成学习检测才能获得钥匙。每次开启必有收获。</p><div class="wallet"><span class="key-pill">🔑 ${state.keys}</span><span class="dust-pill">✨ 星尘 ${state.starDust}</span></div><div class="box-stage section"><div><div id="box-emoji" class="box-emoji">🎁</div><h2 id="box-title">你有 ${state.keys} 把学习钥匙</h2><p id="box-copy" class="muted">10套、60个原创潮玩角色等待收集。</p><button class="primary" data-action="open-box" ${state.keys ? "" : "disabled"}>消耗1把钥匙开启</button></div></div>${state.keys ? "" : `<button class="secondary wide section" data-action="start-home">通过学习获得钥匙</button>`}<div class="panel section"><b>规则公开</b><p class="muted" style="margin:8px 0 0">不售卖钥匙 · 不看广告换抽取 · 每课最多获得一次 · 重复角色转化为星尘</p></div>`;
}
function openBlindBox() {
  const result = core.openBox(state, characters);
  if (!result.ok) return showToast("先完成学习获得钥匙");
  const icon = document.querySelector("#box-emoji");
  icon.classList.add("opening");
  setTimeout(() => {
    state = result.state; saveState(); icon.classList.remove("opening"); icon.textContent = result.character.toy;
    document.querySelector("#box-title").textContent = `获得：${result.character.name}`;
    document.querySelector("#box-copy").textContent = result.duplicate ? "重复角色已转化为10星尘。" : result.character.line;
    const button = document.querySelector("[data-action='open-box']"); button.textContent = "放入收藏馆"; button.dataset.action = "go-collection";
  }, 950);
}
function renderCollection() {
  app.innerHTML = `<div class="eyebrow">10 SERIES · 60 TOYS</div><h1 class="page-title">我的潮玩收藏</h1><p class="muted">已收集 ${state.collection.length}/${characters.length}。</p><div class="toy-grid section">${characters.map(character => { const owned = state.collection.includes(character.id); return `<article class="toy-card ${owned ? "" : "locked"}"><b style="font-size:10px;color:var(--purple-dark)">${character.rarity} · ${character.series}</b><div class="toy">${owned ? character.toy : "❔"}</div><strong>${owned ? character.name : "尚未解锁"}</strong><small>${owned ? character.line : "继续学习会遇见它"}</small></article>`; }).join("")}</div>`;
}
function renderGrowth() {
  const scores = Object.values(state.bestScores || {});
  const recent = catalog.filter(word => state.learned.includes(word.id)).slice(-20).reverse();
  const totalLessons = core.lessonCount(catalog, lessonSize());
  const sizeOptions = [5, 10, 15, 20].map(size => `<button class="size-option ${lessonSize() === size ? "active" : ""}" data-action="set-lesson-size" data-size="${size}">${size}个</button>`).join("");
  app.innerHTML = `<div class="eyebrow">LEARNING GROWTH</div><h1 class="page-title">505词成长记录</h1><div class="panel"><div style="display:flex;justify-content:space-between;margin-bottom:10px"><b>总进度</b><b>${progressPercent()}%</b></div><div class="progress-track"><div class="progress-fill" style="width:${progressPercent()}%"></div></div></div><div class="panel section"><h2>每次学习多少词</h2><div class="lesson-size-options">${sizeOptions}</div><p class="muted setting-note">调整后重新编排课程；已学习单词、钥匙和收藏都会保留。</p></div><div class="grid-4 section"><div class="stat-card"><small>已学习</small><strong>${state.learned.length}</strong><small>共505词</small></div><div class="stat-card"><small>已完成课程</small><strong>${state.completedLessons.length}</strong><small>共${totalLessons}课</small></div><div class="stat-card"><small>检测最佳</small><strong>${scores.length ? Math.max(...scores) : 0}</strong><small>80分达标</small></div><div class="stat-card"><small>待复习</small><strong>${state.learned.length}</strong><small>持续巩固中</small></div></div><button class="secondary wide section" data-route="course">查看全部${totalLessons}课</button><div class="panel section"><h2>最近学习</h2>${recent.length ? recent.map(word => `<button class="word-row wide" style="border-width:0 0 1px;background:transparent;text-align:left" data-action="open-word" data-id="${word.id}"><span><b>${word.word} · ${word.meaning}</b><small>${word.phonetic} · 点击查看卡片</small></span><span class="status learned">待巩固</span></button>`).join("") : `<div class="empty">完成第一课后，这里会出现最近学习的单词。</div>`}</div><button class="ghost wide section" data-action="reset-state">重置全部学习进度</button>`;
}

document.addEventListener("click", event => {
  const target = event.target.closest("[data-route],[data-action]");
  if (!target) return;
  if (target.dataset.route) return navigate(target.dataset.route);
  const action = target.dataset.action;
  if (action === "start-home") return startLesson(state.activeLesson);
  if (action === "open-lesson") return startLesson(Number(target.dataset.index));
  if (action === "open-word") return navigate("word", { id: Number(target.dataset.id) });
  if (action === "play-word") return playWord(Number(target.dataset.id));
  if (action === "play-sentence") return playSentence(Number(target.dataset.id));
  if (action === "record-sentence") return recordSentence(Number(target.dataset.id));
  if (action === "set-lesson-size") {
    const size = core.normalizeLessonSize(target.dataset.size);
    if (size === lessonSize()) return;
    state = Object.assign({}, state, { lessonSize: size, currentLesson: 0, activeLesson: 0, completedLessons: [], rewardedLessons: [], bestScores: {} });
    saveState();
    showToast(`已设置为每次学习${size}个词`);
    return renderGrowth();
  }
  if (action === "record-word") return recordWord(Number(target.dataset.id));
  if (action === "remember-word") { const word = lessonWords[learnPosition]; if (!state.voiceAttempts.includes(word.id)) return; state.learned = core.addUnique(state.learned, word.id); state = core.scheduleReview(state, word.id); saveState(); learnPosition += 1; return renderLearn(); }
  if (action === "start-review") return startReview();
  if (action === "reveal-review") { reviewRevealed = true; return renderReview(); }
  if (action === "grade-review") { const word = reviewQueue[reviewIndex]; state = core.gradeReview(state, word.id, target.dataset.result === "good"); saveState(); reviewIndex += 1; reviewRevealed = false; return renderReview(); }
  if (action === "start-quiz") return startQuiz();
  if (action === "select-option") { selectedAnswer = quiz[quizIndex].options[Number(target.dataset.index)]; return renderQuiz(); }
  if (action === "submit-answer") { const value = quiz[quizIndex].type === "spelling" ? spellingAnswer.trim().toLowerCase() : selectedAnswer; if (!value) return showToast("请先作答"); return commitAnswer(value); }
  if (action === "record-quiz") return recordWord(Number(target.dataset.id), () => commitAnswer("participated"));
  if (action === "result-next") return quizAnswers.filter(answer => answer.correct).length >= 4 ? navigate("box") : startQuiz();
  if (action === "open-box") return openBlindBox();
  if (action === "go-collection") return navigate("collection");
  if (action === "reset-state") { if (confirm("确定清空505词学习记录、钥匙和收藏吗？")) { state = core.defaultState(); saveState(); navigate("growth"); } }
});
document.addEventListener("input", event => {
  if (event.target.id === "course-search") { courseQuery = event.target.value; document.querySelector("#course-content").innerHTML = courseQuery ? renderSearchMarkup(core.search(catalog, courseQuery)) : renderLessonsMarkup(lessonRows()); }
  if (event.target.id === "spelling-input") spellingAnswer = event.target.value;
});
window.addEventListener("online", () => { document.querySelector("#offline-badge").textContent = "已联网"; });
window.addEventListener("offline", () => { document.querySelector("#offline-badge").textContent = "离线可用"; });
window.addEventListener("beforeunload", stopActiveRecording);
if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("./sw.js?v=10").catch(() => {});
saveState();
navigate("home");
