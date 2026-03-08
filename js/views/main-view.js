export function createMainView({ state, els, ui, textHash, onStartText }) {
  function renderHistory() {
    const texts = state.getTexts();
    const container = els.historyList;
    container.innerHTML = '';
    if (texts.length === 0) return;

    const heading = document.createElement('h3');
    heading.className = 'history-heading';
    heading.textContent = 'History';
    container.appendChild(heading);

    [...texts].reverse().forEach((entry) => {
      const item = document.createElement('a');
      item.className = 'history-item';
      item.href = textHash(entry.id);

      const preview = document.createElement('span');
      preview.className = 'history-preview';
      const truncated = entry.text.length > 80 ? entry.text.slice(0, 80) + '…' : entry.text;
      preview.textContent = truncated;

      const meta = document.createElement('span');
      meta.className = 'history-meta';
      meta.textContent = `${entry.sentenceProgress.length} sentences`;

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'history-delete';
      deleteBtn.textContent = '×';
      ui.confirmDelete(deleteBtn, () => {
        state.deleteText(entry.id);
        renderHistory();
      });

      item.appendChild(preview);
      item.appendChild(meta);
      item.appendChild(deleteBtn);
      container.appendChild(item);
    });
  }

  // Allow Enter in textarea (prevent global keydown handler interference)
  els.textInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') e.stopPropagation();
  });

  // Start button
  els.startBtn.addEventListener('click', () => {
    const text = els.textInput.value.trim();
    if (!text) return;

    const apiKey = state.get().apiKey;
    if (!apiKey) {
      ui.showBanner('Please enter your Google Cloud API key first.');
      return;
    }

    ui.hideBanner();
    onStartText(text);
  });

  return {
    enter(route) {
      els.inputView.classList.remove('hidden');
      els.textInput.value = '';
      ui.setActiveNav('text');
      renderHistory();
    },
    leave() {
      els.inputView.classList.add('hidden');
    },
  };
}
