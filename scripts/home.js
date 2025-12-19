import { fetchWikeloItems } from './SingleApiParser.js';

const grid = document.getElementById('item-grid');
const template = document.getElementById('item-card-template');
const statusPill = document.getElementById('status-pill');

function setStatus(text, tone = 'default') {
  statusPill.textContent = text;
  statusPill.style.color = tone === 'error' ? '#f87171' : '#94a3b8';
}

function createCard(item) {
  const node = template.content.cloneNode(true);
  const card = node.querySelector('.card');
  const img = node.querySelector('.card__image');
  const title = node.querySelector('.card__title');
  const note = node.querySelector('.card__note');
  const badge = node.querySelector('.card__badge');

  img.src = item.image;
  img.alt = item.title;
  title.textContent = item.title;
  note.textContent = item.cost === 'N/A' ? 'Cost unknown' : item.cost;
  badge.textContent = 'Wikelo';

  card.addEventListener('click', () => window.open(item.url, '_blank'));
  card.style.cursor = 'pointer';

  return node;
}

async function loadItems() {
  setStatus('Loading Wikelo catalog…');
  grid.innerHTML = '<div class="small">Pulling data from the wiki…</div>';

  try {
    const items = await fetchWikeloItems();
    setStatus(`Loaded ${items.length} items`);
    grid.innerHTML = '';
    if (!items.length) {
      grid.innerHTML = '<div class="small">No items were returned from the Wikelo category.</div>';
      return;
    }

    items.forEach((item) => grid.appendChild(createCard(item)));
  } catch (error) {
    console.error(error);
    setStatus('Could not reach the wiki', 'error');
    grid.innerHTML = '<div class="small">Failed to load data from starcitizen.tools. Please try again later.</div>';
  }
}

loadItems();
