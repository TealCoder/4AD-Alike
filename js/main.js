// Boot / wiring

async function init() {
  // Character modal wiring (once)
  document.getElementById('char-modal-close').onclick = closeCharacterModal;
  document.getElementById('char-modal-backdrop').onclick = (e) => {
    if (e.target.id === 'char-modal-backdrop') closeCharacterModal(); // click outside panel
  };
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCharacterModal();
  });

  renderParty(state.party);
  await startGameFlow();
}

function boot() {
  document.addEventListener("DOMContentLoaded", init);
}

// Keep the old behaviour: load immediately when included
boot();
