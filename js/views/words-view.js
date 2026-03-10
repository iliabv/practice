import { textToSpeech } from '../tts.js';
import { playBlob } from '../audio-utils.js';

export function createWordsView({ state, els, ui }) {
  let sortMode = 'recent';

  function renderCards() {
    const words = state.getSavedWordsSorted(sortMode);
    const container = els.wordCardsContainer;
    container.innerHTML = '';

    els.sortRecentBtn.classList.toggle('active', sortMode === 'recent');
    els.sortSmartBtn.classList.toggle('active', sortMode === 'smart');
    els.sortRecentBtn.onclick = () => { sortMode = 'recent'; renderCards(); };
    els.sortSmartBtn.onclick = () => { sortMode = 'smart'; renderCards(); };

    if (words.length === 0) {
      container.innerHTML = '<div class="word-cards-empty">No saved words yet. Click words in practice sentences to save them.</div>';
      return;
    }

    words.forEach(wordEntry => {
      const card = document.createElement('div');
      card.className = 'word-card';

      const sentenceDiv = document.createElement('div');
      sentenceDiv.className = 'word-card-sentence';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'word-card-gap';
      input.placeholder = '…';

      const settled = () => input.classList.contains('correct') || input.classList.contains('incorrect');

      let checkBtn;

      const doCheck = () => {
        if (settled()) return;
        const val = input.value.trim();
        if (!val) return;
        const correct = val.toLowerCase() === wordEntry.word.toLowerCase();
        const cls = correct ? 'correct' : 'incorrect';
        input.classList.add(cls);
        if (checkBtn) checkBtn.classList.add(cls);
        state.recordPractice(wordEntry.id, correct);
      };

      const lowerSentence = wordEntry.sentence.toLowerCase();
      const wordLower = wordEntry.word.toLowerCase();
      const idx = lowerSentence.indexOf(wordLower);

      const inputWrap = document.createElement('span');
      inputWrap.className = 'word-card-gap-wrap';
      inputWrap.appendChild(input);

      if (idx >= 0) {
        const before = wordEntry.sentence.slice(0, idx);
        const after = wordEntry.sentence.slice(idx + wordEntry.word.length);
        if (before) sentenceDiv.appendChild(document.createTextNode(before));
        sentenceDiv.appendChild(inputWrap);
        if (after) sentenceDiv.appendChild(document.createTextNode(after));
      } else {
        sentenceDiv.appendChild(document.createTextNode(wordEntry.sentence));
        sentenceDiv.appendChild(document.createTextNode(' '));
        sentenceDiv.appendChild(inputWrap);
      }

      checkBtn = document.createElement('button');
      checkBtn.className = 'word-card-btn check';
      checkBtn.textContent = '✓';
      checkBtn.title = 'Check answer';
      checkBtn.onclick = doCheck;

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doCheck(); }
      });
      input.addEventListener('input', () => {
        input.classList.remove('incorrect');
        checkBtn.classList.remove('incorrect');
      });

      const revealBtn = document.createElement('button');
      revealBtn.className = 'word-card-hint';
      revealBtn.textContent = '?';
      revealBtn.title = wordEntry.translation || 'Reveal answer';
      revealBtn.onclick = () => {
        if (settled()) return;
        input.value = '';
        input.placeholder = wordEntry.word;
        input.focus();
      };

      const playBtn = document.createElement('button');
      playBtn.className = 'word-card-btn';
      playBtn.textContent = '▶';
      playBtn.title = 'Play sentence';
      playBtn.onclick = async () => {
        try {
          const blob = await textToSpeech(wordEntry.sentence, state.get().apiKey, {
            voiceName: wordEntry.voiceName,
            speed: wordEntry.speed,
            languageCode: wordEntry.languageCode,
          });
          await playBlob(blob);
        } catch (err) {
          console.error('TTS playback failed:', err);
          ui.showBanner(err.message || 'Playback failed');
        }
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'word-card-btn';
      deleteBtn.textContent = '×';
      deleteBtn.title = 'Delete word';
      ui.confirmDelete(deleteBtn, () => {
        state.deleteWord(wordEntry.id);
        renderCards();
      });

      inputWrap.appendChild(revealBtn);

      const actions = document.createElement('div');
      actions.className = 'word-card-actions';
      actions.appendChild(checkBtn);
      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(sentenceDiv);
      card.appendChild(actions);
      container.appendChild(card);
    });
  }

  return {
    enter(route) {
      els.wordsView.classList.remove('hidden');
      ui.setActiveNav('words');
      renderCards();
    },
    leave() {
      els.wordsView.classList.add('hidden');
    },
  };
}
