const API_BASE = 'https://starcitizen.tools/api.php';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1523961131990-5ea7c61b2107?auto=format&fit=crop&w=800&q=60';

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

async function fetchCategoryMembers(title) {
  let members = [];
  let continueKey = '';

  do {
    const query = new URLSearchParams({
      action: 'query',
      list: 'categorymembers',
      cmtitle: title,
      cmlimit: '50',
      cmcontinue: continueKey,
    });

    const data = await fetchJson(query.toString());
    members = members.concat(data?.query?.categorymembers || []);
    continueKey = data?.continue?.cmcontinue ?? '';
  } while (continueKey);

  return members;
}

function normalizeUrl(url) {
  if (!url) return PLACEHOLDER_IMG;
  if (url.startsWith('http')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `https://starcitizen.tools${url}`;
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

async function fetchItemDetail(member) {
  const query = new URLSearchParams({
    action: 'parse',
    pageid: member.pageid,
    prop: 'text|displaytitle',
  });

  const data = await fetchJson(query.toString());
  const html = data?.parse?.text?.['*'] || '';
  const doc = new DOMParser().parseFromString(html, 'text/html');

  const firstImage = doc.querySelector('.infobox img, figure img, img');
  const cost = extractPrice(doc);
  const ingredients = extractIngredients(doc);

  return {
    id: member.pageid,
    title: data?.parse?.displaytitle || member.title,
    image: normalizeUrl(firstImage?.getAttribute('src')),
    cost,
    ingredients,
    url: `https://starcitizen.tools/${encodeURIComponent(member.title.replace(/\s/g, '_'))}`,
  };
}

export async function fetchWikeloItems() {
  const members = await fetchCategoryMembers('Category:Wikelo');
  const detailPromises = members.map((member) =>
    fetchItemDetail(member).catch((error) => {
      console.error('Failed to build item', member.title, error);
      return {
        id: member.pageid,
        title: member.title,
        image: PLACEHOLDER_IMG,
        cost: 'Unavailable',
        ingredients: [],
        url: `https://starcitizen.tools/${encodeURIComponent(member.title.replace(/\s/g, '_'))}`,
      };
    })
  );

  return Promise.all(detailPromises);
}
