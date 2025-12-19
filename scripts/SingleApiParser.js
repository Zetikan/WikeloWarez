/**
 * Node.js version (no HTML output; returns plain text JSON)
 *
 * Install:
 *   npm i jsdom
 *
 * Run:
 *   node wikelo-plain-parser.js
 *
 * Requires Node 18+ (for global fetch). If you're on Node <18, install node-fetch and
 * uncomment the node-fetch lines below.
 */

const { JSDOM } = require("jsdom");

// --- If Node <18, uncomment these two lines ---
// const fetch = (...args) => import("node-fetch").then(({ default: f }) => f(...args));
// (and run: npm i node-fetch)

const MW_API = "https://starcitizen.tools/api.php";

const EXCLUDE_SECTIONS = new Set(["References", "External links", "See also", "Notes"]);

const norm = (s) =>
    (s ?? "")
        .replace(/\u00a0/g, " ")
        .replace(/\s+/g, " ")
        .trim();

const cellToText = (cell) => {
    const lis = cell.querySelectorAll("li");
    if (lis.length) return [...lis].map((li) => norm(li.textContent)).filter(Boolean).join("; ");

    const brs = cell.querySelectorAll("br");
    if (brs.length) {
        const tmp = cell.cloneNode(true);
        tmp.querySelectorAll("br").forEach((br) => br.replaceWith("\n"));
        return norm(tmp.textContent).replace(/\n+/g, "; ");
    }

    return norm(cell.textContent);
};

async function mwParseSections(page) {
    const url = new URL(MW_API);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", page);
    url.searchParams.set("prop", "sections");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`sections fetch failed: ${res.status}`);
    const json = await res.json();
    return json?.parse?.sections ?? [];
}

async function mwParseSectionHtml(page, sectionIndex) {
    const url = new URL(MW_API);
    url.searchParams.set("action", "parse");
    url.searchParams.set("page", page);
    url.searchParams.set("section", String(sectionIndex));
    url.searchParams.set("prop", "text");
    url.searchParams.set("format", "json");
    url.searchParams.set("formatversion", "2");
    url.searchParams.set("origin", "*");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`section ${sectionIndex} fetch failed: ${res.status}`);
    const json = await res.json();
    return json?.parse?.text ?? "";
}

function tableToMatrix(table) {
    const rows = [...table.querySelectorAll("tr")];
    const grid = [];
    const spanMap = [];

    for (let r = 0; r < rows.length; r++) {
        grid[r] = [];
        let c = 0;

        while (spanMap[c]?.remain > 0) {
            grid[r][c] = spanMap[c].text;
            spanMap[c].remain -= 1;
            c++;
        }

        const cells = [...rows[r].querySelectorAll("th,td")];
        for (const cell of cells) {
            while (spanMap[c]?.remain > 0) {
                grid[r][c] = spanMap[c].text;
                spanMap[c].remain -= 1;
                c++;
            }

            const text = cellToText(cell);
            const rowspan = Math.max(1, parseInt(cell.getAttribute("rowspan") || "1", 10));
            const colspan = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10));

            for (let k = 0; k < colspan; k++) {
                grid[r][c + k] = text;
                if (rowspan > 1) spanMap[c + k] = { remain: rowspan - 1, text };
            }
            c += colspan;
        }

        while (spanMap[c]?.remain > 0) {
            grid[r][c] = spanMap[c].text;
            spanMap[c].remain -= 1;
            c++;
        }
    }

    const width = Math.max(...grid.map((r) => r.length), 0);
    for (const row of grid) while (row.length < width) row.push("");
    return grid.map((row) => row.map(norm));
}

function matrixToObjects(table, matrix) {
    const firstRowHasTH = !!table.querySelector("tr:first-child th");
    const headers = firstRowHasTH
        ? matrix[0].map((h, i) => (h ? h : `col${i + 1}`))
        : matrix[0].map((_, i) => `col${i + 1}`);

    const start = firstRowHasTH ? 1 : 0;

    const rows = [];
    for (const row of matrix.slice(start)) {
        if (row.every((x) => !x)) continue;
        const obj = {};
        for (let i = 0; i < headers.length; i++) obj[headers[i]] = row[i] ?? "";
        rows.push(obj);
    }

    return { headers, rows };
}

function extractKVFromTwoColTable(matrix) {
    if (!matrix.length || matrix[0].length !== 2) return {};
    const kv = {};

    for (const row of matrix) {
        const k = norm(row[0]);
        const v = norm(row[1]);
        if (!k || !v) continue;
        if (/^(key|value|name|description)$/i.test(k)) continue;

        if (kv[k] === undefined) kv[k] = v;
        else if (Array.isArray(kv[k])) kv[k].push(v);
        else kv[k] = [kv[k], v];
    }

    return kv;
}

function extractColonKVFromText(root) {
    const kv = {};
    const nodes = [...root.querySelectorAll("p, li")];

    for (const n of nodes) {
        const text = norm(n.textContent);
        if (!text.includes(":")) continue;

        const idx = text.indexOf(":");
        const key = norm(text.slice(0, idx));
        const value = norm(text.slice(idx + 1));

        if (!key || !value) continue;
        if (key.length > 60) continue;

        if (kv[key] === undefined) kv[key] = value;
        else if (Array.isArray(kv[key])) kv[key].push(value);
        else kv[key] = [kv[key], value];
    }

    return kv;
}

function sectionHtmlToPlainData(html) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const root = doc.body;

    const tables = [];
    const kv = {};

    for (const table of root.querySelectorAll("table")) {
        const matrix = tableToMatrix(table);

        // 2-col tables -> KV
        const tableKV = extractKVFromTwoColTable(matrix);
        if (Object.keys(tableKV).length) Object.assign(kv, tableKV);

        // Always also keep row objects (for 3+ col wikitables like Currencies)
        const { headers, rows } = matrixToObjects(table, matrix);
        if (rows.length) {
            const caption = norm(table.querySelector("caption")?.textContent || "");
            tables.push({ caption, headers, rows });
        }
    }

    // "Key: Value" in prose/lists
    const proseKV = extractColonKVFromText(root);
    for (const [k, v] of Object.entries(proseKV)) {
        if (kv[k] === undefined) kv[k] = v;
    }

    // Plain lists (text only)
    const lists = [...root.querySelectorAll("ul,ol")]
        .map((list) =>
            [...list.querySelectorAll(":scope > li")]
                .map((li) => norm(li.textContent))
                .filter(Boolean)
        )
        .filter((arr) => arr.length);

    return { kv, tables, lists };
}

async function parsePageToPlainKV(page) {
    const sections = await mwParseSections(page);

    const out = {
        page,
        kv: {},       // flattened KV across all sections
        tables: [],   // flattened table rows across all sections
        sections: {}, // per-section { kv, tables, lists }
    };

    for (const s of sections) {
        const name = s.line;
        if (EXCLUDE_SECTIONS.has(name)) continue;

        const html = await mwParseSectionHtml(page, s.index);
        const data = sectionHtmlToPlainData(html);

        out.sections[name] = data;

        // merge flattened kv
        for (const [k, v] of Object.entries(data.kv)) {
            if (out.kv[k] === undefined) out.kv[k] = v;
            else if (Array.isArray(out.kv[k])) out.kv[k].push(v);
            else out.kv[k] = [out.kv[k], v];
        }

        // flatten tables
        out.tables.push(
            ...data.tables.map((t) => ({
                section: name,
                ...t,
            }))
        );
    }

    return out;
}

// --- Example usage ---
(async () => {
    const data = await parsePageToPlainKV("Wikelo");

    // Full dump:
    // console.log(JSON.stringify(data, null, 2));

    // “Currencies” table rows as plain text objects:
    const currenciesTables = data.tables.filter((t) => t.section === "Weapons, Utilites, Cu");
    console.log("Currencies tables:", JSON.stringify(currenciesTables, null, 2));

    // Flattened KV across the page (best-effort):
    console.log("Flattened KV keys:", Object.keys(data.kv).slice(0, 30));
})();
