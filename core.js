(function attachWordieCore(root) {
  const LESSON_SIZE = 5;

  function normalizeLessonSize(size) { return [5, 10, 15, 20].includes(Number(size)) ? Number(size) : LESSON_SIZE; }
  function lessonCount(catalog, size = LESSON_SIZE) { return Math.ceil(catalog.length / normalizeLessonSize(size)); }
  function getLesson(catalog, index, size = LESSON_SIZE) {
    const lessonSize = normalizeLessonSize(size);
    const max = lessonCount(catalog, lessonSize) - 1;
    const safe = Math.max(0, Math.min(Number(index) || 0, max));
    return catalog.slice(safe * lessonSize, safe * lessonSize + lessonSize);
  }
  function lessonMeta(catalog, index, size = LESSON_SIZE) {
    const words = getLesson(catalog, index, size);
    const sounds = [...new Set(words.map(word => word.phonicsGroup || "待归类"))];
    return {
      index,
      number: index + 1,
      title: `第${index + 1}课 · ${sounds.join("・")}`,
      subtitle: words.map(word => word.word).join(" · "),
      icon: words[0]?.icon || "✨",
      wordIds: words.map(word => word.id)
    };
  }
  function uniqueOptions(correct, candidates) {
    const options = [correct];
    candidates.forEach(value => {
      if (value && !options.includes(value) && options.length < 3) options.push(value);
    });
    return options.sort((a, b) => (a.length + correct.length) % 3 - (b.length + correct.length) % 3);
  }
  function buildQuiz(catalog, index, size = LESSON_SIZE) {
    const words = getLesson(catalog, index, size);
    const [a, b, c, d, e] = [words[0], words[Math.min(1, words.length - 1)], words[Math.min(2, words.length - 1)], words[Math.min(3, words.length - 1)], words[words.length - 1]];
    const escaped = d.word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const context = new RegExp(escaped, "i").test(d.example)
      ? d.example.replace(new RegExp(escaped, "i"), "____")
      : `${d.example} 请选择目标词。`;
    return [
      { type: "choice", label: "看词选义", wordId: a.id, word: a.word, prompt: `${a.word} 是什么意思？`, options: uniqueOptions(a.meaning, [b.meaning, c.meaning, d.meaning]), answer: a.meaning },
      { type: "audio", label: "听音选词", wordId: b.id, word: b.word, prompt: "听发音，选择你听到的单词。", options: uniqueOptions(b.word, [a.word, c.word, e.word]), answer: b.word },
      { type: "spelling", label: "字母拼写", wordId: c.id, word: c.word, prompt: `请拼写“${c.meaning}”。`, answer: c.word.toLowerCase() },
      { type: "choice", label: "情境选词", wordId: d.id, word: d.word, prompt: context, options: uniqueOptions(d.word, [b.word, e.word, a.word]), answer: d.word },
      { type: "voice", label: "语音跟读", wordId: e.id, word: e.word, prompt: `听一遍，然后跟读 ${e.word}。`, answer: "participated" }
    ];
  }
  function defaultState() {
    return { learned: [], voiceAttempts: [], keys: 0, starDust: 0, collection: [], lessonSize: 5, currentLesson: 0, activeLesson: 0, completedLessons: [], rewardedLessons: [], bestScores: {} };
  }
  function normalizeState(value) { return Object.assign(defaultState(), value || {}); }
  function addUnique(list, value) { return list.includes(value) ? list.slice() : list.concat(value); }
  function canAwardKey(score, voiceCompleted, learnedIds, lessonWordIds, alreadyRewarded) {
    return score >= 80 && voiceCompleted && lessonWordIds.every(id => learnedIds.includes(id)) && !alreadyRewarded;
  }
  function finishLesson(stateInput, payload) {
    const state = normalizeState(stateInput);
    const { score, voiceCompleted, lessonIndex, lessonWordIds, totalLessons } = payload;
    const alreadyRewarded = state.rewardedLessons.includes(lessonIndex);
    const rewarded = canAwardKey(score, voiceCompleted, state.learned, lessonWordIds, alreadyRewarded);
    const passed = score >= 80 && voiceCompleted;
    const nextLesson = passed ? Math.min(Math.max(state.currentLesson, lessonIndex + 1), totalLessons - 1) : state.currentLesson;
    return Object.assign({}, state, {
      keys: state.keys + (rewarded ? 1 : 0),
      rewardedLessons: rewarded ? addUnique(state.rewardedLessons, lessonIndex) : state.rewardedLessons,
      completedLessons: passed ? addUnique(state.completedLessons, lessonIndex) : state.completedLessons,
      currentLesson: nextLesson,
      activeLesson: passed && state.activeLesson === lessonIndex ? nextLesson : state.activeLesson,
      bestScores: Object.assign({}, state.bestScores, { [lessonIndex]: Math.max(state.bestScores[lessonIndex] || 0, score) })
    });
  }
  function openBox(stateInput, characters) {
    const state = normalizeState(stateInput);
    if (state.keys < 1) return { ok: false, state };
    const character = characters.find(item => !state.collection.includes(item.id)) || characters[0];
    const duplicate = state.collection.includes(character.id);
    return {
      ok: true,
      character,
      duplicate,
      state: Object.assign({}, state, {
        keys: state.keys - 1,
        starDust: state.starDust + (duplicate ? 10 : 0),
        collection: addUnique(state.collection, character.id)
      })
    };
  }
  function search(catalog, keyword) {
    const query = String(keyword || "").trim().toLowerCase();
    if (!query) return [];
    return catalog.filter(word => word.word.toLowerCase().includes(query) || word.raw.toLowerCase().includes(query) || word.meaning.includes(query)).slice(0, 50);
  }
  function audioPath(id) { return `assets/audio/${(`000${id}`).slice(-3)}.m4a`; }

  root.WORDIE_CORE = { LESSON_SIZE, normalizeLessonSize, lessonCount, getLesson, lessonMeta, buildQuiz, defaultState, normalizeState, addUnique, canAwardKey, finishLesson, openBox, search, audioPath };
})(typeof window === "undefined" ? globalThis : window);
