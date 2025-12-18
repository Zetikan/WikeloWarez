const API_BASE = 'https://starcitizen.tools/api.php';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?auto=format&fit=crop&w=800&q=60';

function stripHtml(text) {
  if (!text) return '';
  const doc = new DOMParser().parseFromString(text, 'text/html');
  return (doc.body.textContent || '').trim();
}

function buildUrl(params) {
  return `${API_BASE}?origin=*&format=json&${params}`;
}

async function fetchJson(params) {
  const response = await fetch(buildUrl(params));
  if (!response.ok) {
    throw new Error(`Wiki request failed: ${response.status}`);
  }
  return response.json();
}

function normalizeUrl(url) {
  if (!url) return PLACEHOLDER_IMG;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://starcitizen.tools${url}`;
}

function extractCostFromCells(cells) {
  for (const cell of cells) {
    const rawText = cell.textContent.replace(/\[\d+\]/g, '').trim();
    if (!rawText) continue;
    const match = rawText.match(/([\d.,]+\s*(?:a?UEC|UEC|SCU))/i);
    if (match) {
      return match[1].trim();
    }
  }
  return 'N/A';
}

function extractRequirements(cell) {
  if (!cell) return [];

  const entries = [];
  const liNodes = cell.querySelectorAll('li');

  const addEntry = (text) => {
    const clean = stripHtml(text).replace(/\[\d+\]/g, '').trim();
    if (!clean) return;
    const qtyName = clean.match(/^([\d.,]+)\s*[×x]?\s*(.+)$/i);
    const nameQty = clean.match(/^(.+?)\s*[×x]?\s*(\d+)$/);

    if (qtyName) {
      const quantity = Number(qtyName[1]);
      entries.push({ name: qtyName[2].trim(), quantity: Number.isFinite(quantity) ? quantity : 1 });
      return;
    }

    if (nameQty) {
      const quantity = Number(nameQty[2]);
      entries.push({ name: nameQty[1].trim(), quantity: Number.isFinite(quantity) ? quantity : 1 });
      return;
    }

    entries.push({ name: clean, quantity: 1 });
  };

  if (liNodes.length) {
    liNodes.forEach((li) => addEntry(li.textContent));
  } else {
    const htmlSplits = cell.innerHTML
      .split(/<br\s*\/?>/i)
      .map((chunk) => chunk.replace(/<[^>]+>/g, '').trim())
      .filter(Boolean);

    if (htmlSplits.length) {
      htmlSplits.forEach(addEntry);
    } else {
      cell.textContent
        .split(/[\n•;,]/)
        .map((chunk) => chunk.trim())
        .filter(Boolean)
        .forEach(addEntry);
    }
  }

  return entries;
}

function extractPrice(doc) {
  const rows = Array.from(doc.querySelectorAll('table.infobox tr, table tr'));
  for (const row of rows) {
    const header = row.querySelector('th');
    const cell = row.querySelector('td');
    if (header && cell && /price|cost|buy/i.test(header.textContent)) {
      return cell.textContent.trim();
    }
  }
  return 'N/A';
}

function extractIngredients(doc) {
  const ingredients = [];
  const headings = Array.from(doc.querySelectorAll('h2, h3, h4')).filter((h) =>
    /ingredient|recipe|required|craft/i.test(h.textContent)
  );

  headings.forEach((heading) => {
    let node = heading.nextElementSibling;
    while (node && !/^H[2-4]$/.test(node.tagName)) {
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        node.querySelectorAll('li').forEach((li) => {
          const text = li.textContent.trim();
          if (!text) return;
          const match = text.match(/(.+?)\s*[×x*]\s*(\d+)/i) || text.match(/(.+?)\s*(\d+)x/i);
          if (match) {
            ingredients.push({ name: match[1].trim(), quantity: Number(match[2]) || 1 });
          } else {
            ingredients.push({ name: text, quantity: 1 });
          }
        });
      }
      node = node.nextElementSibling;
    }
  });

  return ingredients;
}

async function fetchItemDetail(baseItem) {
  const query = new URLSearchParams({
    action: 'parse',
    page: baseItem.title,
    prop: 'text|displaytitle',
  });

  const data = await fetchJson(query.toString());
  const html = data?.parse?.text?.['*'] || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const firstImage = doc.querySelector('.infobox img, figure img, img');
  const cost = extractPrice(doc);
  const ingredients = extractIngredients(doc);
  const mergedIngredients = ingredients.length ? ingredients : baseItem.ingredients || [];
  const rawTitle = data?.parse?.displaytitle || baseItem.title;

  return {
    id: data?.parse?.pageid || baseItem.id,
    title: stripHtml(rawTitle),
    image: normalizeUrl(firstImage?.getAttribute('src') || baseItem.image),
    cost: cost === 'N/A' ? baseItem.cost || 'N/A' : cost,
    ingredients: mergedIngredients,
    url: `https://starcitizen.tools/${encodeURIComponent((baseItem.title || '').replace(/\s/g, '_'))}`,
  };
}

async function fetchWikeloLandingItems() {
  const query = new URLSearchParams({
    action: 'parse',
    page: 'Wikelo',
    prop: 'text',
  });

  const data = await fetchJson(query.toString());
  const html = data?.parse?.text?.['*'] || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const items = new Map();

  doc.querySelectorAll('.mw-parser-output table').forEach((table) => {
    const headerCells = Array.from(table.querySelectorAll('tr:first-child th')).map((th) =>
      th.textContent.trim().toLowerCase()
    );

    table.querySelectorAll('tr').forEach((row, rowIndex) => {
      if (rowIndex === 0 && headerCells.length) return;
      const cells = Array.from(row.querySelectorAll('td'));
      if (!cells.length) return;

      const getCellByHeader = (name) => {
        const idx = headerCells.findIndex((h) => h.includes(name));
        return idx >= 0 ? cells[idx] : null;
      };

      const rewardCell = getCellByHeader('reward') || cells[0];
      const requirementsCell =
        getCellByHeader('need') || getCellByHeader('ingredient') || getCellByHeader('depend') || cells[1];

      const link = rewardCell?.querySelector('a[title]') || row.querySelector('a[title]');
      const title = stripHtml(link?.getAttribute('title') || link?.textContent?.trim());
      if (!title) return;

      const requirements = extractRequirements(requirementsCell);
      const costFromDeps = requirementsCell
        ?.textContent.replace(/\[\d+\]/g, '')
        .match(/([\d.,]+\s*(?:a?UEC|UEC|SCU))/i)?.[1];
      const cost = costFromDeps || extractCostFromCells(cells);
      const image = normalizeUrl((rewardCell || row).querySelector('img')?.getAttribute('src'));

      items.set(title, {
        id: title,
        title,
        cost,
        image,
        ingredients: requirements,
        url: `https://starcitizen.tools/${encodeURIComponent(title.replace(/\s/g, '_'))}`,
      });
    });
  });

  return Array.from(items.values());
}

export async function fetchWikeloItems() {
  const baseItems = await fetchWikeloLandingItems();
  const detailPromises = baseItems.map((item) =>
    fetchItemDetail(item).catch((error) => {
      console.error('Failed to build item', item.title, error);
      return {
        id: item.id,
        title: item.title,
        image: item.image || PLACEHOLDER_IMG,
        cost: item.cost || 'Unavailable',
        ingredients: [],
        url: item.url,
      };
    })
  );

  return Promise.all(detailPromises);
}
