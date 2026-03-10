import { textToSpeech } from '../tts.js';
import { playBlob } from '../audio-utils.js';

function formatStats(wordEntry) {
  const total = wordEntry.practices?.length || 0;
  if (total === 0) return 'New';
  const correct = wordEntry.practices.filter(p => p.correct).length;
  const due = wordEntry.nextDue || 0;
  const overdue = due <= Date.now();
  const parts = [`${correct}/${total}`];
  if (overdue) {
    parts.push('due now');
  } else {
    const days = Math.ceil((due - Date.now()) / (24 * 60 * 60 * 1000));
    parts.push(`next in ${days}d`);
  }
  return parts.join(' · ');
}

export function createWordsView({ state, els, ui }) {
  function renderCards() {
    const sortMode = state.get().wordsSortMode;
    const words = state.getSavedWordsSorted(sortMode);
    const container = els.wordCardsContainer;
    container.innerHTML = '';

    els.sortRecentBtn.classList.toggle('active', sortMode === 'recent');
    els.sortDueBtn.classList.toggle('active', sortMode === 'due');
    els.sortRecentBtn.onclick = () => { state.setWordsSortMode('recent'); renderCards(); };
    els.sortDueBtn.onclick = () => { state.setWordsSortMode('due'); renderCards(); };

    if (words.length === 0) {
      container.innerHTML = '<div class="word-cards-empty">No saved words yet. Click words in practice sentences to save them.</div>';
      return;
    }

    words.forEach(wordEntry => {
      const card = document.createElement('div');
      card.className = 'word-card';

      const sentenceDiv = document.createElement('div');
      sentenceDiv.className = 'word-card-sentence';

      const gap = document.createElement('span');
      gap.className = 'word-card-gap';
      gap.textContent = '\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0';

      const gapWrap = document.createElement('span');
      gapWrap.className = 'word-card-gap-wrap';
      gapWrap.appendChild(gap);

      const lowerSentence = wordEntry.sentence.toLowerCase();
      const wordLower = wordEntry.word.toLowerCase();
      const idx = lowerSentence.indexOf(wordLower);

      if (idx >= 0) {
        const before = wordEntry.sentence.slice(0, idx);
        const after = wordEntry.sentence.slice(idx + wordEntry.word.length);
        if (before) sentenceDiv.appendChild(document.createTextNode(before));
        sentenceDiv.appendChild(gapWrap);
        if (after) sentenceDiv.appendChild(document.createTextNode(after));
      } else {
        sentenceDiv.appendChild(document.createTextNode(wordEntry.sentence));
        sentenceDiv.appendChild(document.createTextNode(' '));
        sentenceDiv.appendChild(gapWrap);
      }

      const infoDiv = document.createElement('div');
      infoDiv.className = 'word-card-info';

      const statsSpan = document.createElement('span');
      statsSpan.className = 'word-card-stats';
      statsSpan.textContent = formatStats(wordEntry);

      const translationSpan = document.createElement('span');
      translationSpan.className = 'word-card-translation hidden';
      translationSpan.textContent = wordEntry.translation || '';

      infoDiv.appendChild(statsSpan);
      infoDiv.appendChild(translationSpan);

      const actions = document.createElement('div');
      actions.className = 'word-card-actions';

      const revealBtn = document.createElement('button');
      revealBtn.className = 'word-card-btn reveal';
      revealBtn.textContent = '?';
      revealBtn.title = 'Reveal answer';

      const thumbUpBtn = document.createElement('button');
      thumbUpBtn.className = 'word-card-btn thumb-up hidden';
      thumbUpBtn.textContent = '\u2713';
      thumbUpBtn.title = 'I knew it';

      const thumbDownBtn = document.createElement('button');
      thumbDownBtn.className = 'word-card-btn thumb-down hidden';
      thumbDownBtn.textContent = '\u2717';
      thumbDownBtn.title = "I didn't know it";

      const reveal = () => {
        if (gap.classList.contains('revealed')) return;
        gap.textContent = wordEntry.word;
        gap.classList.add('revealed');
        translationSpan.classList.remove('hidden');
        revealBtn.classList.add('hidden');
        thumbUpBtn.classList.remove('hidden');
        thumbDownBtn.classList.remove('hidden');
      };

      revealBtn.onclick = reveal;
      gap.onclick = reveal;

      let hasRated = false;
      const rate = (correct) => {
        gap.classList.remove('correct', 'incorrect');
        thumbUpBtn.classList.remove('selected');
        thumbDownBtn.classList.remove('selected');
        if (hasRated) {
          state.updateLastPractice(wordEntry.id, correct);
        } else {
          state.recordPractice(wordEntry.id, correct);
          hasRated = true;
        }
        gap.classList.add(correct ? 'correct' : 'incorrect');
        (correct ? thumbUpBtn : thumbDownBtn).classList.add('selected');
        statsSpan.textContent = formatStats(
          state.getSavedWords().find(w => w.id === wordEntry.id) || wordEntry
        );
      };

      thumbUpBtn.onclick = () => rate(true);
      thumbDownBtn.onclick = () => rate(false);

      const playBtn = document.createElement('button');
      playBtn.className = 'word-card-btn';
      playBtn.textContent = '\u25B6';
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
      deleteBtn.className = 'word-card-btn word-card-delete';
      deleteBtn.textContent = '\u00D7';
      deleteBtn.title = 'Delete word';
      ui.confirmDelete(deleteBtn, () => {
        state.deleteWord(wordEntry.id);
        renderCards();
      });

      actions.appendChild(revealBtn);
      actions.appendChild(thumbUpBtn);
      actions.appendChild(thumbDownBtn);
      actions.appendChild(playBtn);
      actions.appendChild(deleteBtn);

      card.appendChild(sentenceDiv);
      card.appendChild(infoDiv);
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
