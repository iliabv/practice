import { parseSentences } from '../sentence-parser.js';
import { textToSpeech } from '../tts.js';
import { startRecording, stopRecording, ensurePipeline, releasePipeline } from '../recorder.js';
import { playBlob, stopPlayback, getAudioContext, getAudioContextSync } from '../audio-utils.js';
import { translateWord, explainSentence } from '../translate.js';

export function createTextView({ state, els, ui }) {
  let sentences = [];
  let lineBreaks = new Map();
  let loopGeneration = 0;
  let activeWordIndex = -1;
  let highlightedEls = [];
  let activeWord = null; // { word, wordInfo, isSaved, sentenceText }
  let sentenceExplain = null; // null | { loading, data: { translation, grammar } }
  let resolveRecordTrigger = null;

  // Play-all state
  const pa = {
    source: null,
    buffer: null,
    startTime: 0,
    offset: 0,
    rafId: null,
    sentenceTimes: [],
  };

  // --- Rendering helpers ---

  function renderSentences() {
    const activeText = state.getActiveText();
    const player = els.inlinePlayer;
    if (player.parentNode === els.sentencesPanel) {
      els.sentencesPanel.removeChild(player);
    }

    els.sentencesPanel.innerHTML = '';
    sentences.forEach((text, i) => {
      const span = document.createElement('span');
      span.className = 'sentence';
      span.textContent = text;
      span.dataset.index = i;
      span.style.backgroundColor = ui.loopColor(activeText.sentenceProgress[i]?.loopCount || 0);
      span.addEventListener('click', () => onSentenceClick(i));
      if (i > 0) {
        const count = lineBreaks.get(i);
        if (count > 0) {
          for (let b = 0; b < count; b++) {
            els.sentencesPanel.appendChild(document.createElement('br'));
          }
        } else {
          els.sentencesPanel.appendChild(document.createTextNode(' '));
        }
      }
      els.sentencesPanel.appendChild(span);
    });

    els.sentencesPanel.appendChild(player);
  }

  function setActiveSentence(index) {
    els.sentencesPanel.querySelectorAll('.sentence').forEach((span) => {
      span.classList.toggle('active', Number(span.dataset.index) === index);
    });
    positionInlinePlayer();
  }

  function updateSentenceColor(index, loopCount) {
    const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
    if (span) span.style.backgroundColor = ui.loopColor(loopCount);
  }

  function positionInlinePlayer() {
    const activeEl = els.sentencesPanel.querySelector('.sentence.active');
    const player = els.inlinePlayer;
    if (!activeEl || player.classList.contains('hidden')) return;

    const sentenceRect = activeEl.getBoundingClientRect();
    const panelRect = els.sentencesPanel.getBoundingClientRect();
    let left = sentenceRect.left - panelRect.left;
    const top = sentenceRect.bottom - panelRect.top + 6;
    const playerWidth = player.offsetWidth;
    if (left + playerWidth > panelRect.width) {
      left = Math.max(0, panelRect.width - playerWidth);
    }
    player.style.top = `${top}px`;
    player.style.left = `${left}px`;
  }

  function renderPlayer({ phase, loopCount, onPlay }) {
    const isRecording = phase === 'recording';
    const isLoading = phase === 'loading';
    const isAwaitingRecord = phase === 'awaiting-record';
    const isPreparing = phase === 'preparing';
    const interactive = phase === 'idle' || isRecording || isAwaitingRecord;

    const iconContent = (isLoading || isPreparing)
      ? '<div class="spinner"></div>'
      : isRecording ? '⏹' : isAwaitingRecord ? '⏺' : '▶';

    let phaseText = '';
    if (phase === 'loading') phaseText = 'Loading…';
    else if (phase === 'playing-original') phaseText = 'Playing…';
    else if (phase === 'awaiting-record') phaseText = 'Press to record';
    else if (phase === 'preparing') phaseText = 'Preparing…';
    else if (phase === 'recording') phaseText = 'Recording…';
    else if (phase === 'playing-user') phaseText = 'Your recording…';

    const player = els.inlinePlayer;
    const iconClasses = 'play-icon' + (isRecording ? ' recording' : '') + (isAwaitingRecord ? ' awaiting-record' : '') + ((isLoading || isPreparing) ? ' loading' : '');

    let mainHtml = `
      <span class="${iconClasses}">${iconContent}</span>
      <span class="loop-counter">${loopCount}x</span>
      ${phaseText ? `<span class="phase-label">${phaseText}</span>` : ''}
    `;

    if (activeWord) {
      const { wordInfo, isSaved } = activeWord;
      const saveClass = 'inline-player-action' + (isSaved ? ' saved' : '');
      const saveIcon = isSaved ? '★' : '☆';
      const saveTitle = isSaved ? 'Remove word' : 'Save word';

      if (wordInfo === null) {
        mainHtml += `
          <div class="spinner" style="margin-left:auto"></div>
        `;
      } else {
        mainHtml += `
          <span class="inline-player-translation">${ui.escapeHtml(wordInfo.translation)}</span>
        `;
      }
      mainHtml += `
        <button class="inline-player-action" title="Play word">▶</button>
        <button class="${saveClass}" title="${saveTitle}"${wordInfo === null ? ' disabled' : ''}>${saveIcon}</button>
      `;
    }

    // Explain button (always visible)
    const explainClass = 'inline-player-explain' + (sentenceExplain?.data ? ' active' : '');
    const explainContent = sentenceExplain?.loading ? '<div class="spinner"></div>' : '?';
    mainHtml += `<button class="${explainClass}"${!activeWord ? ' style="margin-left:auto"' : ''} title="Explain sentence">${explainContent}</button>`;

    // Update main pill content; preserve meta element to avoid re-triggering animation
    let mainEl = player.querySelector('.inline-player-main');
    if (!mainEl) {
      mainEl = document.createElement('div');
      mainEl.className = 'inline-player-main';
      player.appendChild(mainEl);
    }
    mainEl.innerHTML = mainHtml;

    // Build meta content (word info and/or sentence explanation)
    const existingMeta = player.querySelector('.inline-player-meta');
    let metaHtml = '';
    if (activeWord?.wordInfo) {
      const { wordInfo } = activeWord;
      const metaParts = [];
      const detailParts = [wordInfo.infinitive, wordInfo.partOfSpeech].filter(Boolean);
      if (detailParts.length) metaParts.push(ui.escapeHtml(detailParts.join(' · ')));
      if (wordInfo.usage) metaParts.push(ui.escapeHtml(wordInfo.usage));
      if (metaParts.length) metaHtml += metaParts.map(p => `<span>${p}</span>`).join('');
    }
    if (activeWord?.wordInfo && sentenceExplain?.data) {
      metaHtml += '<hr class="meta-divider">';
    }
    if (sentenceExplain?.data) {
      metaHtml += `<span class="meta-explain-translation">${ui.escapeHtml(sentenceExplain.data.translation)}</span>`;
      metaHtml += `<span class="meta-explain-grammar">${ui.escapeHtml(sentenceExplain.data.grammar)}</span>`;
    }
    if (metaHtml) {
      if (existingMeta) {
        existingMeta.innerHTML = metaHtml;
      } else {
        const metaEl = document.createElement('div');
        metaEl.className = 'inline-player-meta';
        metaEl.innerHTML = metaHtml;
        player.appendChild(metaEl);
      }
    } else if (existingMeta) {
      existingMeta.remove();
    }
    player.classList.toggle('has-word', !!activeWord || !!sentenceExplain?.data);
    player.classList.toggle('disabled', !interactive);
    player.classList.toggle('recording', isRecording);
    player.classList.remove('hidden');
    player.querySelector('.inline-player-main').onclick = interactive ? onPlay : null;

    if (activeWord) wireWordButtons(player);
    wireExplainButton(player);
    positionInlinePlayer();
  }

  function wireWordButtons(player) {
    const playBtn = player.querySelector('[title="Play word"]');
    if (playBtn) {
      playBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!activeWord) return;
        const s = state.get();
        if (!s.apiKey) return;
        playBtn.textContent = '…';
        playBtn.disabled = true;
        try {
          const blob = await textToSpeech(activeWord.word, s.apiKey, {
            voiceName: s.voiceName,
            speed: s.speed,
            languageCode: s.languageCode,
            model: s.ttsModel,
          });
          playBtn.textContent = '▶';
          playBtn.disabled = false;
          await playBlob(blob);
        } catch {
          playBtn.textContent = '▶';
          playBtn.disabled = false;
        }
      };
    }

    const saveBtn = player.querySelector('[title="Save word"], [title="Remove word"]');
    if (saveBtn) {
      saveBtn.onclick = (e) => {
        e.stopPropagation();
        if (!activeWord || !activeWord.wordInfo) return;
        if (activeWord.isSaved) {
          const saved = state.getSavedWord(activeWord.word, activeWord.sentenceText);
          if (saved) state.deleteWord(saved.id);
          clearActiveWord();
        } else {
          const s = state.get();
          const info = activeWord.wordInfo || {};
          state.saveWord({
            word: activeWord.word,
            sentence: activeWord.sentenceText,
            translation: info.translation || '',
            infinitive: info.infinitive || '',
            partOfSpeech: info.partOfSpeech || '',
            synonyms: info.synonyms || [],
            usage: info.usage || '',
            languageCode: s.languageCode,
          });
          activeWord.isSaved = true;
          updatePlayer();
        }
      };
    }
  }

  function clearActiveWord() {
    activeWord = null;
    clearHighlight();
    updatePlayer();
  }

  function wireExplainButton(player) {
    const btn = player.querySelector('.inline-player-explain');
    if (btn) {
      btn.onclick = (e) => {
        e.stopPropagation();
        onExplainClick();
      };
    }
  }

  async function onExplainClick() {
    if (sentenceExplain) {
      sentenceExplain = null;
      updatePlayer();
      return;
    }

    const s = state.get();
    const index = s.activeSentenceIndex;
    if (index < 0 || !s.apiKey) return;

    const sentenceText = sentences[index];
    sentenceExplain = { loading: true, data: null };
    updatePlayer();

    try {
      const data = await explainSentence(sentenceText, s.apiKey, s.languageCode);
      if (state.get().activeSentenceIndex !== index) return;
      sentenceExplain = { loading: false, data };
      updatePlayer();
    } catch (err) {
      console.error('Explain failed:', err);
      if (state.get().activeSentenceIndex !== index) return;
      sentenceExplain = { loading: false, data: { translation: '(failed)', grammar: '' } };
      updatePlayer();
    }
  }

  function clearPlayer() {
    activeWord = null;
    sentenceExplain = null;
    clearHighlight();
    els.inlinePlayer.classList.add('hidden');
    els.inlinePlayer.innerHTML = '';
  }

  function setSentenceRevealed(index, revealed) {
    const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
    if (span) span.classList.toggle('revealed', revealed);
  }

  function setTextHidden(hidden) {
    els.sentencesPanel.classList.toggle('text-hidden', hidden);
    els.toggleTextBtn.classList.toggle('active', hidden);
    els.toggleTextBtn.textContent = hidden ? 'Show text' : 'Hide text';
  }

  function setHoldMic(holdActive) {
    els.holdMicBtn.classList.toggle('active', holdActive);
  }

  // --- Full player rendering ---

  function renderFullPlayerIdle() {
    const player = els.fullPlayer;
    player.innerHTML = `
      <button class="full-player-btn">▶</button>
      <div class="full-player-track disabled">
        <div class="full-player-fill" style="width:0%"></div>
      </div>
    `;
    player.classList.remove('hidden');
    player.querySelector('.full-player-btn').onclick = playAll;
  }

  function renderFullPlayerLoading() {
    const player = els.fullPlayer;
    player.innerHTML = `
      <div class="full-player-btn loading"><div class="spinner"></div></div>
      <div class="full-player-track disabled">
        <div class="full-player-fill" style="width:0%"></div>
      </div>
    `;
    player.classList.remove('hidden');
  }

  function renderFullPlayer({ playing, onPlayPause, onSeek }) {
    const player = els.fullPlayer;
    player.innerHTML = `
      <button class="full-player-btn">${playing ? '⏸' : '▶'}</button>
      <div class="full-player-track">
        <div class="full-player-fill" style="width:0%"></div>
        <div class="full-player-caret" style="left:0%"></div>
      </div>
      <span class="full-player-time">0:00 / 0:00</span>
    `;
    player.classList.remove('hidden');

    player.querySelector('.full-player-btn').onclick = onPlayPause;

    const track = player.querySelector('.full-player-track');
    const seekTo = (e) => {
      const rect = track.getBoundingClientRect();
      const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(fraction);
    };
    track.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      seekTo(e);
      const onMove = (ev) => seekTo(ev);
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    });
  }

  function updateFullPlayerProgress(currentTime, duration) {
    const player = els.fullPlayer;
    if (player.classList.contains('hidden')) return;
    const fraction = duration > 0 ? currentTime / duration : 0;
    const pct = (fraction * 100).toFixed(2) + '%';
    const fill = player.querySelector('.full-player-fill');
    const caret = player.querySelector('.full-player-caret');
    const time = player.querySelector('.full-player-time');
    if (fill) fill.style.width = pct;
    if (caret) caret.style.left = pct;
    if (time) time.textContent = `${ui.formatTime(currentTime)} / ${ui.formatTime(duration)}`;
  }

  function updateFullPlayerButton(playing) {
    const btn = els.fullPlayer.querySelector('.full-player-btn');
    if (btn) btn.textContent = playing ? '⏸' : '▶';
  }

  function clearFullPlayer() {
    els.fullPlayer.classList.add('hidden');
    els.fullPlayer.innerHTML = '';
  }

  function setFullPlayingSentence(index) {
    els.sentencesPanel.querySelectorAll('.sentence').forEach((span) => {
      span.classList.toggle('full-playing', Number(span.dataset.index) === index);
    });
  }

  // --- Word interaction rendering ---

  function enableWordInteraction(index) {
    const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
    if (!span || span.querySelector('.word')) return;
    const text = span.textContent;
    span.innerHTML = '';
    const parts = text.split(/(\s+)/);
    parts.forEach(part => {
      if (/^\s+$/.test(part)) {
        span.appendChild(document.createTextNode(part));
      } else {
        const wordSpan = document.createElement('span');
        wordSpan.className = 'word';
        wordSpan.textContent = part;
        const cleanWord = part.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
        wordSpan.addEventListener('click', (e) => {
          e.stopPropagation();
          if (cleanWord) onWordClick(cleanWord, wordSpan, text);
        });
        span.appendChild(wordSpan);
      }
    });
  }

  function disableWordInteraction(index) {
    const span = els.sentencesPanel.querySelector(`.sentence[data-index="${index}"]`);
    if (span) span.textContent = span.textContent;
  }

  function clearHighlight() {
    for (const el of highlightedEls) {
      if (!el.parentNode) continue;
      if (el.classList.contains('word')) {
        el.classList.remove('word-highlighted');
      } else {
        // Unwrap temporary highlight span (non-active sentence)
        const parent = el.parentNode;
        parent.replaceChild(document.createTextNode(el.textContent), el);
        parent.normalize();
      }
    }
    highlightedEls = [];
  }

  function highlightInSentence(word, sentenceIndex) {
    clearHighlight();
    if (sentenceIndex < 0) return null;

    const span = els.sentencesPanel.querySelector(`.sentence[data-index="${sentenceIndex}"]`);
    if (!span) return null;

    const wordSpans = span.querySelectorAll('.word');
    if (wordSpans.length > 0) {
      // Active sentence with .word spans
      const clean = w => w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
      const targetWords = word.split(/\s+/);

      if (targetWords.length === 1) {
        // Single word — find matching span
        for (const ws of wordSpans) {
          if (clean(ws.textContent).toLowerCase() === targetWords[0].toLowerCase()) {
            ws.classList.add('word-highlighted');
            highlightedEls.push(ws);
            return ws.getBoundingClientRect();
          }
        }
      } else {
        // Multi-word — find contiguous spans
        const allWords = [...wordSpans];
        for (let i = 0; i <= allWords.length - targetWords.length; i++) {
          let match = true;
          for (let j = 0; j < targetWords.length; j++) {
            if (clean(allWords[i + j].textContent).toLowerCase() !== targetWords[j].toLowerCase()) {
              match = false;
              break;
            }
          }
          if (match) {
            const matched = allWords.slice(i, i + targetWords.length);
            for (const ws of matched) {
              ws.classList.add('word-highlighted');
              highlightedEls.push(ws);
            }
            const first = matched[0].getBoundingClientRect();
            const last = matched[matched.length - 1].getBoundingClientRect();
            return new DOMRect(first.left, first.top, last.right - first.left, last.bottom - first.top);
          }
        }
      }
    } else {
      // Non-active sentence — plain text, use Range to wrap
      const textNode = [...span.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent.includes(word));
      if (textNode) {
        const idx = textNode.textContent.indexOf(word);
        if (idx >= 0) {
          const range = document.createRange();
          range.setStart(textNode, idx);
          range.setEnd(textNode, idx + word.length);
          const wrapper = document.createElement('span');
          wrapper.className = 'word-highlighted';
          range.surroundContents(wrapper);
          highlightedEls.push(wrapper);
          return wrapper.getBoundingClientRect();
        }
      }
    }

    return null;
  }

  // --- Translation popup (integrated into inline player) ---

  async function showTranslationPopup(word, anchorRect, sentenceText) {
    const sentenceIndex = sentences.indexOf(sentenceText);

    // Ensure sentence is active so the player is visible
    if (state.get().activeSentenceIndex !== sentenceIndex && sentenceIndex >= 0) {
      onSentenceClick(sentenceIndex);
    }

    highlightInSentence(word, sentenceIndex);
    activeWord = { word, wordInfo: null, isSaved: state.isWordSaved(word, sentenceText), sentenceText };
    updatePlayer();

    try {
      const s = state.get();
      const wordInfo = await translateWord(word, s.apiKey, s.languageCode, sentenceText);
      if (!activeWord || activeWord.word !== word) return;
      activeWord.wordInfo = wordInfo;
      activeWord.isSaved = state.isWordSaved(word, sentenceText);
      updatePlayer();
    } catch (err) {
      console.error('Translation failed:', err);
      if (!activeWord || activeWord.word !== word) return;
      activeWord.wordInfo = { translation: '(translation failed)', infinitive: '', partOfSpeech: '', synonyms: [], usage: '' };
      updatePlayer();
    }
  }

  function onWordClick(word, wordSpan, sentenceText) {
    showTranslationPopup(word, wordSpan.getBoundingClientRect(), sentenceText);
  }

  // --- Abort / cancel ---

  function abortLoop() {
    const prev = state.get().activeSentenceIndex;
    stopPlayback();
    if (state.get().phase === 'recording' || state.get().phase === 'preparing') stopRecording();
    resolveRecordTrigger = null;
    loopGeneration++;
    if (prev >= 0) {
      setSentenceRevealed(prev, false);
    }
  }

  function cancelActiveLoop() {
    abortLoop();
    if (activeWordIndex >= 0) {
      disableWordInteraction(activeWordIndex);
      activeWordIndex = -1;
    }
    activeWord = null;
    sentenceExplain = null;
    clearHighlight();
    state.setActiveSentence(-1);
    setActiveSentence(-1);
    clearPlayer();
  }

  // --- Sentence click ---

  function onSentenceClick(index) {
    const s = state.get();
    if (s.playingAll) pausePlayAll();
    if (s.holdMic) ensurePipeline().catch(() => { });
    if (s.activeSentenceIndex !== index) {
      if (activeWordIndex >= 0) {
        disableWordInteraction(activeWordIndex);
        activeWordIndex = -1;
      }
      activeWord = null;
      sentenceExplain = null;
      clearHighlight();
      abortLoop();
      state.setActiveSentence(index);
      setActiveSentence(index);
    }

    if (activeWordIndex < 0) {
      enableWordInteraction(index);
      activeWordIndex = index;
    }
    updatePlayer();
  }

  // --- Recording ---

  function waitForRecording(gen) {
    return new Promise((resolve) => {
      const cancelled = () => gen !== loopGeneration;
      resolveRecordTrigger = async () => {
        resolveRecordTrigger = null;
        if (cancelled()) { resolve(null); return; }
        state.setPhase('preparing');
        updatePlayer();
        try {
          const blob = await startRecording({
            onReady() {
              if (cancelled()) return;
              state.setPhase('recording');
              updatePlayer();
            }
          });
          resolve(cancelled() ? null : blob);
        } catch (err) {
          resolve(null);
          throw err;
        }
      };
    });
  }

  // --- Play/Stop button ---

  function onPlayStop() {
    const s = state.get();
    if (s.phase === 'recording' || s.phase === 'preparing') {
      stopRecording();
      return;
    }
    if (s.phase === 'awaiting-record' && resolveRecordTrigger) {
      resolveRecordTrigger();
      return;
    }
    if (s.phase === 'idle') {
      runLoop();
    }
  }

  function updatePlayer() {
    const s = state.get();
    if (s.activeSentenceIndex < 0) {
      clearPlayer();
      return;
    }
    const activeText = state.getActiveText();
    if (!activeText) {
      clearPlayer();
      return;
    }
    const progress = activeText.sentenceProgress[s.activeSentenceIndex];
    renderPlayer({
      phase: s.phase,
      loopCount: progress?.loopCount || 0,
      onPlay: onPlayStop,
    });
  }

  // --- Main practice loop ---

  async function runLoop() {
    const s = state.get();
    const index = s.activeSentenceIndex;
    const sentenceText = sentences[index];
    const apiKey = s.apiKey;
    const gen = loopGeneration;

    if (!apiKey) {
      ui.showBanner('Please enter your Gemini API key first.');
      return;
    }

    const cancelled = () => gen !== loopGeneration;

    try {
      state.setPhase('loading');
      updatePlayer();
      const audioBlob = await textToSpeech(sentenceText, apiKey, {
        voiceName: s.voiceName,
        speed: s.speed,
        languageCode: s.languageCode,
        model: s.ttsModel,
      });
      if (cancelled()) return;
      state.setPhase('playing-original');
      updatePlayer();
      await playBlob(audioBlob);
      if (cancelled()) return;

      state.setPhase('awaiting-record');
      updatePlayer();
      const userBlob = await waitForRecording(gen);
      if (cancelled() || !userBlob) return;

      if (!state.get().holdMic) releasePipeline();

      state.setUserRecording(userBlob);
      state.setPhase('playing-user');
      updatePlayer();
      if (state.get().textHidden) setSentenceRevealed(index, true);
      await new Promise(r => setTimeout(r, 500));
      if (cancelled()) return;
      await playBlob(userBlob);
      if (cancelled()) return;

      state.incrementLoop(index);
      const activeText = state.getActiveText();
      updateSentenceColor(index, activeText.sentenceProgress[index].loopCount);

      state.setPhase('playing-original');
      updatePlayer();
      await new Promise(r => setTimeout(r, 500));
      if (cancelled()) return;
      await playBlob(audioBlob);
      if (cancelled()) return;
      setSentenceRevealed(index, false);

      state.setPhase('idle');
      updatePlayer();
    } catch (err) {
      if (cancelled()) return;
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        ui.showBanner('Microphone access required. Please allow microphone permissions.');
      } else {
        ui.showBanner(err.message || 'An error occurred');
      }
      state.setPhase('idle');
      updatePlayer();
    }
  }

  // --- Toggle text visibility ---

  function toggleTextHidden() {
    const hidden = !state.get().textHidden;
    state.setTextHidden(hidden);
    setTextHidden(hidden);
  }

  // --- Toggle hold mic ---

  function toggleHoldMic() {
    const hold = !state.get().holdMic;
    state.setHoldMic(hold);
    setHoldMic(hold);
    if (hold) {
      ensurePipeline().catch(() => { });
    } else {
      releasePipeline();
    }
  }

  // --- Play all ---

  function buildSentenceTimes(sentenceList, duration) {
    const totalChars = sentenceList.reduce((sum, s) => sum + s.length, 0);
    const times = [];
    let offset = 0;
    for (const s of sentenceList) {
      const len = (s.length / totalChars) * duration;
      times.push({ start: offset, end: offset + len });
      offset += len;
    }
    return times;
  }

  function findSentenceAtTime(currentTime, sentenceTimes) {
    for (let i = 0; i < sentenceTimes.length; i++) {
      if (currentTime < sentenceTimes[i].end) return i;
    }
    return sentenceTimes.length - 1;
  }

  function playAllCurrentTime() {
    if (!pa.source) return pa.offset;
    const ctx = getAudioContextSync();
    return pa.offset + (ctx.currentTime - pa.startTime);
  }

  function startPlayAllSource(offset) {
    const ctx = getAudioContextSync();
    const source = ctx.createBufferSource();
    source.buffer = pa.buffer;
    source.connect(ctx.destination);
    source.onended = () => {
      if (pa.source !== source) return;
      const elapsed = ctx.currentTime - pa.startTime;
      if (offset + elapsed >= pa.buffer.duration - 0.05) {
        stopPlayAll();
      }
    };
    pa.source = source;
    pa.startTime = ctx.currentTime;
    pa.offset = offset;
    source.start(0, offset);
  }

  async function playAll() {
    if (state.get().playingAll) {
      if (pa.source) {
        pausePlayAll();
      } else if (pa.buffer) {
        cancelActiveLoop();
        await getAudioContext();
        startPlayAllSource(pa.offset);
        updateFullPlayerButton(true);
        startPlayAllTick();
      }
      return;
    }

    const s = state.get();
    const apiKey = s.apiKey;
    if (!apiKey) {
      ui.showBanner('Please enter your Gemini API key first.');
      return;
    }

    cancelActiveLoop();
    state.setPlayingAll(true);

    renderFullPlayerLoading();

    try {
      const blob = await textToSpeech(sentences.join(' '), apiKey, {
        voiceName: s.voiceName,
        speed: s.speed,
        languageCode: s.languageCode,
        model: s.ttsModel,
      });

      if (!state.get().playingAll) return;

      const ctx = await getAudioContext();
      pa.buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
      pa.sentenceTimes = buildSentenceTimes(sentences, pa.buffer.duration);

      if (!state.get().playingAll) return;

      renderFullPlayer({
        playing: true,
        onPlayPause: playAll,
        onSeek: (fraction) => {
          if (!pa.buffer) return;
          const wasPlaying = !!pa.source;
          if (pa.source) {
            pa.source.onended = null;
            pa.source.stop();
            pa.source = null;
          }
          const newOffset = fraction * pa.buffer.duration;
          if (wasPlaying) {
            startPlayAllSource(newOffset);
          } else {
            pa.offset = newOffset;
          }
        },
      });

      startPlayAllSource(0);
      startPlayAllTick();
    } catch (err) {
      console.error(err);
      ui.showBanner(err.message || 'An error occurred');
      stopPlayAll();
    }
  }

  function startPlayAllTick() {
    if (pa.rafId) cancelAnimationFrame(pa.rafId);
    const tick = () => {
      if (!state.get().playingAll || !pa.source) return;
      const ct = playAllCurrentTime();
      const dur = pa.buffer ? pa.buffer.duration : 0;
      updateFullPlayerProgress(ct, dur);
      if (dur > 0 && pa.sentenceTimes.length > 0) {
        const idx = findSentenceAtTime(ct, pa.sentenceTimes);
        setFullPlayingSentence(idx);
      }
      pa.rafId = requestAnimationFrame(tick);
    };
    pa.rafId = requestAnimationFrame(tick);
  }

  function pausePlayAll() {
    if (!pa.source) return;
    pa.offset = playAllCurrentTime();
    pa.source.onended = null;
    pa.source.stop();
    pa.source = null;
    if (pa.rafId) {
      cancelAnimationFrame(pa.rafId);
      pa.rafId = null;
    }
    setFullPlayingSentence(-1);
    updateFullPlayerButton(false);
  }

  function stopPlayAll() {
    if (pa.rafId) {
      cancelAnimationFrame(pa.rafId);
      pa.rafId = null;
    }
    if (pa.source) {
      pa.source.onended = null;
      pa.source.stop();
      pa.source = null;
    }
    pa.buffer = null;
    pa.offset = 0;
    state.setPlayingAll(false);
    setFullPlayingSentence(-1);
    if (sentences.length > 0) {
      renderFullPlayerIdle();
    } else {
      clearFullPlayer();
    }
  }

  // --- Escape handler ---

  function onEscape() {
    if (activeWord || sentenceExplain) {
      activeWord = null;
      sentenceExplain = null;
      clearHighlight();
      updatePlayer();
      return;
    }

    const playerOpen = !els.inlinePlayer.classList.contains('hidden');

    if (playerOpen) {
      abortLoop();
      state.setPhase('idle');
      clearPlayer();
      return;
    }

    if (state.get().activeSentenceIndex >= 0) {
      if (activeWordIndex >= 0) {
        disableWordInteraction(activeWordIndex);
        activeWordIndex = -1;
      }
      state.setActiveSentence(-1);
      setActiveSentence(-1);
    }
  }

  // --- Keyboard shortcuts ---

  const NEXT_KEYS = new Set(['Enter', 'ArrowDown', 'ArrowRight']);
  const PREV_KEYS = new Set(['Backspace', 'Delete', 'ArrowUp', 'ArrowLeft']);

  function onKeyDown(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    if (sentences.length === 0) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      if (state.get().playingAll) {
        stopPlayAll();
        return;
      }
      onEscape();
      return;
    }

    if (e.key === 'p' || e.key === 'P') {
      e.preventDefault();
      playAll();
      return;
    }

    if (e.code === 'Space') {
      if (state.get().activeSentenceIndex < 0) return;
      e.preventDefault();
      onPlayStop();
      return;
    }

    const dir = NEXT_KEYS.has(e.key) ? 1 : PREV_KEYS.has(e.key) ? -1 : 0;
    if (dir) {
      e.preventDefault();
      const current = state.get().activeSentenceIndex;
      if (dir === -1 && current < 0) return;
      const target = current < 0 ? 0 : Math.max(0, Math.min(current + dir, sentences.length - 1));
      if (target !== current) onSentenceClick(target);
      return;
    }

    if (e.key === 't' || e.key === 'T' || e.key === 'h' || e.key === 'H') {
      e.preventDefault();
      toggleTextHidden();
      return;
    }

    if (e.key === 'm' || e.key === 'M') {
      e.preventDefault();
      toggleHoldMic();
    }
  }

  // --- Click outside to dismiss ---

  function onMouseDown(e) {
    const target = e.target;
    if (target.closest('.sentence')) return;
    if (target.closest('.inline-player')) return;
    if (activeWord) {
      activeWord = null;
      clearHighlight();
    }
    if (!els.inlinePlayer.classList.contains('hidden')) {
      abortLoop();
      state.setPhase('idle');
      clearPlayer();
    }
  }

  return {
    enter(route) {
      const { textId } = route;
      if (textId) state.setActiveTextId(textId);
      const activeText = state.getActiveText();
      if (!activeText) throw new Error('Text not found');

      const { sentences: parsed, lineBreaks: breaks } = parseSentences(activeText.text);
      if (parsed.length === 0) throw new Error('No sentences');
      // Reset progress if sentence count changed (e.g. parser update, stale localStorage)
      if (parsed.length !== activeText.sentenceProgress.length) {
        state.setText(activeText.text, parsed.length);
      }

      sentences = parsed;
      lineBreaks = breaks;

      els.textInput.value = activeText.text;
      els.textView.classList.remove('hidden');
      ui.setActiveNav('text');
      els.toggleTextBtn.addEventListener('click', toggleTextHidden);
      els.holdMicBtn.addEventListener('click', toggleHoldMic);
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('mousedown', onMouseDown);
      window.addEventListener('resize', positionInlinePlayer);

      renderSentences();
      setTextHidden(state.get().textHidden);
      setHoldMic(state.get().holdMic);
      clearPlayer();
      renderFullPlayerIdle();
    },
    leave() {
      els.toggleTextBtn.removeEventListener('click', toggleTextHidden);
      els.holdMicBtn.removeEventListener('click', toggleHoldMic);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('resize', positionInlinePlayer);
      els.textView.classList.add('hidden');
      stopPlayAll();
      clearFullPlayer();
      cancelActiveLoop();
      releasePipeline();
      state.clearActiveText();
      sentences = [];
      lineBreaks = new Map();
    },
  };
}
