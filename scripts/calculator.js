import { fetchWikeloItems } from './wikeloApi.js';

const ingredientList = document.getElementById('ingredient-list');
const addButton = document.getElementById('add-ingredient');
const input = document.getElementById('new-ingredient');
const counterTemplate = document.getElementById('counter-template');
const craftTemplate = document.getElementById('craft-card-template');
const craftList = document.getElementById('craftable-list');
const status = document.getElementById('calc-status');

const inventory = new Map();
let items = [];
const favorites = new Set();

function normalizeKey(name) {
  return name.trim().toLowerCase();
}

function setStatus(text, tone = 'default') {
  status.textContent = text;
  status.style.color = tone === 'error' ? '#f87171' : '#94a3b8';
}

function renderInventory() {
  ingredientList.innerHTML = '';
  const entries = Array.from(inventory.entries());
  if (!entries.length) {
    ingredientList.innerHTML = '<div class="small">No ingredients yet. Add one above to start tracking.</div>';
    return;
  }

  entries.forEach(([name, count]) => {
    const node = counterTemplate.content.cloneNode(true);
    node.querySelector('.card__title').textContent = name;
    node.querySelector('.count').textContent = count;

    node.querySelectorAll('.counter-button[data-step]').forEach((button) => {
      button.addEventListener('click', () => updateCount(name, Number(button.dataset.step)));
    });

    node.querySelector('[data-remove="true"]').addEventListener('click', () => {
      inventory.delete(name);
      renderInventory();
      renderCraftables();
    });

    ingredientList.appendChild(node);
  });
}

function updateCount(name, delta) {
  const current = inventory.get(name) || 0;
  const next = Math.max(0, current + delta);
  inventory.set(name, next);
  renderInventory();
  renderCraftables();
}

function addIngredient() {
  const value = input.value.trim();
  if (!value) return;
  const key = normalizeKey(value);
  if (!inventory.has(key)) {
    inventory.set(key, 0);
  }
  input.value = '';
  renderInventory();
  renderCraftables();
}

function formatRequirements(ingredients) {
  if (!ingredients?.length) return 'No recipe data found yet.';
  return ingredients
    .map((ing) => `${ing.name} × ${ing.quantity}`)
    .join(', ');
}

function canCraft(item) {
  if (!item.ingredients.length) return false;
  return item.ingredients.every((req) => {
    const available = inventory.get(normalizeKey(req.name)) || 0;
    return available >= req.quantity;
  });
}

function renderCraftables() {
  const craftable = items.filter(canCraft);
  craftList.innerHTML = '';

  if (!craftable.length) {
    craftList.innerHTML = '<div class="small">Add ingredients to see what you can build. Items appear as soon as their requirements are met.</div>';
    return;
  }

  craftable.sort((a, b) => {
    const favA = favorites.has(a.id);
    const favB = favorites.has(b.id);
    if (favA !== favB) return favA ? -1 : 1;
    return a.title.localeCompare(b.title);
  });

  craftable.forEach((item) => {
    const node = craftTemplate.content.cloneNode(true);
    node.querySelector('.craft-card__title').textContent = item.title;
    node.querySelector('.craft-card__ingredients').textContent = formatRequirements(item.ingredients);
    node.querySelector('.small').textContent = `Cost: ${item.cost}`;

    const star = node.querySelector('.star-toggle');
    const renderStar = () => (star.textContent = favorites.has(item.id) ? '★' : '☆');
    renderStar();
    star.addEventListener('click', () => {
      if (favorites.has(item.id)) {
        favorites.delete(item.id);
      } else {
        favorites.add(item.id);
      }
      renderStar();
      renderCraftables();
    });

    craftList.appendChild(node);
  });
}

async function load() {
  try {
    setStatus('Syncing with starcitizen.tools…');
    items = await fetchWikeloItems();
    setStatus(`Loaded ${items.length} items`);
  } catch (error) {
    console.error(error);
    setStatus('Could not reach the wiki', 'error');
  } finally {
    renderCraftables();
  }
}

addButton.addEventListener('click', addIngredient);
input.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') addIngredient();
});

renderInventory();
load();
