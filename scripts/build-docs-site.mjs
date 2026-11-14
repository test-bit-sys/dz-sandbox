#!/usr/bin/env node
/**
 * Zero-dependency offline static documentation generator for dz-sandbox.
 * - Converts all Markdown files in docs/ to self-contained HTML under dist-docs/
 * - Arabic RTL default (index.html === index.ar.html), plus French & English home pages
 * - Emits offline search index (search-index.json + search-index.js)
 * - Zero external scripts, stylesheets, or font CDN requests
 * - Run with `--verify` to validate links, RTL, search index, and offline purity
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DOCS_DIR = path.join(ROOT, "docs");
const OUT_DIR = path.join(ROOT, "dist-docs");

function collectMarkdownFiles(dir, base = dir) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...collectMarkdownFiles(full, base));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      results.push({
        absPath: full,
        relPath: path.relative(base, full).replace(/\\/g, "/"),
      });
    }
  }
  return results.sort((a, b) => a.relPath.localeCompare(b.relPath));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function slugify(text) {
  let cleaned = String(text);
  while (cleaned.includes("<") && cleaned.includes(">")) {
    const next = cleaned.replace(/<[^>]*>/g, "");
    if (next === cleaned) break;
    cleaned = next;
  }
  return cleaned
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s+/g, "-");
}

function rewriteHref(href) {
  const trimmed = href.trim();
  if (!trimmed || trimmed.startsWith("#") || /^[a-z]+:/i.test(trimmed)) {
    return trimmed;
  }
  const hashIdx = trimmed.indexOf("#");
  const pathPart = hashIdx >= 0 ? trimmed.slice(0, hashIdx) : trimmed;
  const hashPart = hashIdx >= 0 ? trimmed.slice(hashIdx) : "";
  if (pathPart.endsWith(".md")) {
    return `${pathPart.slice(0, -3)}.html${hashPart}`;
  }
  return trimmed;
}

function renderInline(text) {
  const codeTokens = [];
  let working = text.replace(/`([^`]+)`/g, (_m, code) => {
    const idx = codeTokens.length;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return `@@CODE_${idx}@@`;
  });

  working = escapeHtml(working);

  working = working.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, rawHref) => {
    const href = escapeHtml(rewriteHref(rawHref));
    return `<a href="${href}">${label}</a>`;
  });
  working = working.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  working = working.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  for (let i = 0; i < codeTokens.length; i++) {
    working = working.replace(`@@CODE_${i}@@`, codeTokens[i]);
  }
  return working;
}

function splitTableRow(line) {
  let trimmed = line.trim();
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  const trimmed = line.trim();
  if (!trimmed.includes("|") || !trimmed.includes("-")) return false;
  return splitTableRow(trimmed).every((cell) => /^:?-{2,}:?$/.test(cell));
}

function markdownToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  const headings = [];
  let title = "";
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fenceMatch = line.match(/^```([\w-]*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || "text";
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing fence
      out.push(
        `<pre><code class="language-${escapeHtml(lang)}">${escapeHtml(
          codeLines.join("\n")
        )}</code></pre>`
      );
      continue;
    }

    // Blank line
    if (!line.trim()) {
      i++;
      continue;
    }

    // Horizontal rule
    if (/^(\*{3,}|-{3,}|_{3,})\s*$/.test(line.trim())) {
      out.push("<hr />");
      i++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const rawText = headingMatch[2].trim();
      const plainText = rawText.replace(/`([^`]+)`/g, "$1").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      if (!title && level === 1) title = plainText;
      const id = slugify(plainText) || `sec-${headings.length + 1}`;
      headings.push({ level, text: plainText, id });
      out.push(`<h${level} id="${escapeHtml(id)}">${renderInline(rawText)}</h${level}>`);
      i++;
      continue;
    }

    // Table
    if (
      line.includes("|") &&
      i + 1 < lines.length &&
      isTableSeparator(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && lines[i].trim() && lines[i].includes("|")) {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const thHtml = headers.map((h) => `<th>${renderInline(h)}</th>`).join("");
      const trHtml = rows
        .map(
          (row) =>
            `<tr>${headers
              .map((_h, idx) => `<td>${renderInline(row[idx] ?? "")}</td>`)
              .join("")}</tr>`
        )
        .join("");
      out.push(
        `<div class="table-wrap"><table><thead><tr>${thHtml}</tr></thead><tbody>${trHtml}</tbody></table></div>`
      );
      continue;
    }

    // Blockquote
    if (line.trim().startsWith(">")) {
      const quoteLines = [];
      while (i < lines.length && lines[i].trim().startsWith(">")) {
        quoteLines.push(lines[i].replace(/^\s*>\s?/, ""));
        i++;
      }
      out.push(`<blockquote>${quoteLines.map((l) => renderInline(l)).join("<br />")}</blockquote>`);
      continue;
    }

    // Unordered / Ordered list
    if (/^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line)) {
      const ordered = /^\s*\d+\.\s+/.test(line);
      const tag = ordered ? "ol" : "ul";
      const items = [];
      const itemRegex = ordered ? /^\s*\d+\.\s+(.*)$/ : /^\s*[-*+]\s+(.*)$/;
      while (i < lines.length && itemRegex.test(lines[i])) {
        const m = lines[i].match(itemRegex);
        items.push(`<li>${renderInline(m[1])}</li>`);
        i++;
      }
      out.push(`<${tag}>${items.join("")}</${tag}>`);
      continue;
    }

    // Paragraph
    const paraLines = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^```/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !lines[i].trim().startsWith(">") &&
      !/^(\*{3,}|-{3,}|_{3,})\s*$/.test(lines[i].trim()) &&
      !(lines[i].includes("|") && i + 1 < lines.length && isTableSeparator(lines[i + 1]))
    ) {
      paraLines.push(lines[i].trim());
      i++;
    }
    out.push(`<p>${renderInline(paraLines.join(" "))}</p>`);
  }

  return {
    title: title || "dz-sandbox Documentation",
    headings,
    html: out.join("\n"),
    plainText: md
      .replace(/```[\w-]*/g, " ")
      .replace(/[#>*`|[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  };
}

function detectLanguage(relPath) {
  if (relPath.endsWith(".ar.md") || relPath === "index.html") return { lang: "ar", dir: "rtl" };
  if (relPath.endsWith(".fr.md")) return { lang: "fr", dir: "ltr" };
  return { lang: "en", dir: "ltr" };
}

function renderLayout({ title, lang, dir, relHtmlPath, bodyHtml }) {
  const depth = relHtmlPath.includes("/") ? relHtmlPath.split("/").length - 1 : 0;
  const prefix = depth === 0 ? "./" : "../".repeat(depth);

  const labels =
    lang === "ar"
      ? {
          searchPlaceholder: "ابحث في التوثيق والسيناريوهات والأخطاء... (اضغط / للبحث)",
          noResults: "لا توجد نتائج مطابقة.",
          spec: "حالة المواصفات",
          bugs: "أخطاء التكامل (9)",
          fixtures: "المساهمة بالبيانات",
          scenarios: "السيناريوهات (33)",
          threat: "نموذج التهديدات",
          copy: "نسخ",
          copied: "تم النسخ!",
        }
      : lang === "fr"
        ? {
            searchPlaceholder: "Rechercher dans la documentation... (Appuyez sur /)",
            noResults: "Aucun résultat trouvé.",
            spec: "Statut API",
            bugs: "9 Erreurs Courantes",
            fixtures: "Contribuer Fixtures",
            scenarios: "Scénarios (33)",
            threat: "Menaces",
            copy: "Copier",
            copied: "Copié !",
          }
        : {
            searchPlaceholder: "Search docs, scenarios, bug guides... (Press / to search)",
            noResults: "No matching documentation found.",
            spec: "Spec Status",
            bugs: "9 Bug Guides",
            fixtures: "Contributing Fixtures",
            scenarios: "Scenarios (33)",
            threat: "Threat Model",
            copy: "Copy",
            copied: "Copied!",
          };

  return `<!doctype html>
<html lang="${lang}" dir="${dir}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)} — dz-sandbox</title>
<meta property="og:title" content="${escapeHtml(title)} — dz-sandbox" />
<meta property="og:description" content="Local deterministic sandbox simulating Algerian payment and delivery APIs (Chargily Pay v2, SATIM, Yalidine, BaridiMob). Test what fails offline." />
<meta property="og:type" content="website" />
<meta property="og:image" content="https://test-bit-sys.github.io/dz-sandbox/assets/banner.png" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(title)} — dz-sandbox" />
<meta name="twitter:description" content="Local deterministic sandbox simulating Algerian payment, courier, and banking APIs. Test what fails offline." />
<meta name="twitter:image" content="https://test-bit-sys.github.io/dz-sandbox/assets/banner.png" />
<style>
  :root {
    --bg: #0f172a;
    --surface: #1e293b;
    --border: #334155;
    --text: #f8fafc;
    --muted: #cbd5e1;
    --accent: #38bdf8;
    --code-bg: #020617;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif;
    background: var(--bg);
    color: var(--text);
    line-height: 1.65;
  }
  header {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    padding: 0.9rem 1.25rem;
    position: sticky;
    top: 0;
    z-index: 20;
  }
  .nav-inner {
    max-width: 1100px;
    margin: 0 auto;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1.25rem;
    align-items: center;
    justify-content: space-between;
  }
  .brand {
    font-weight: 700;
    color: var(--accent);
    text-decoration: none;
    font-size: 1.05rem;
  }
  nav a {
    color: var(--muted);
    text-decoration: none;
    margin-inline-end: 0.85rem;
    font-size: 0.92rem;
  }
  nav a:hover { color: var(--text); text-decoration: underline; }
  .langs {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  .langs a {
    color: var(--text);
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.2rem 0.55rem;
    font-size: 0.82rem;
    text-decoration: none;
  }
  .gh-link {
    background: #0284c7 !important;
    color: #ffffff !important;
    border-color: #38bdf8 !important;
    font-weight: 600;
  }
  .gh-link:hover {
    background: #0369a1 !important;
  }
  .search-wrap {
    max-width: 1100px;
    margin: 1rem auto 0;
    padding: 0 1.25rem;
    position: relative;
  }
  #docs-search {
    width: 100%;
    padding: 0.65rem 2.8rem 0.65rem 0.9rem;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-size: 0.95rem;
  }
  [dir="rtl"] #docs-search {
    padding: 0.65rem 0.9rem 0.65rem 2.8rem;
  }
  .search-kbd {
    position: absolute;
    inset-inline-end: 2rem;
    top: 50%;
    transform: translateY(-50%);
    background: #0f172a;
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0.1rem 0.4rem;
    font-size: 0.75rem;
    color: var(--muted);
    pointer-events: none;
  }
  #search-results {
    margin-top: 0.5rem;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.5rem;
    display: none;
  }
  #search-results a {
    display: block;
    padding: 0.45rem 0.65rem;
    border-radius: 6px;
    color: var(--text);
    text-decoration: none;
  }
  #search-results a:hover { background: #334155; }
  #search-results small { color: var(--muted); display: block; }
  main {
    max-width: 1100px;
    margin: 1.25rem auto 3rem;
    padding: 0 1.25rem;
  }
  article {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 1.5rem 1.75rem;
  }
  h1, h2, h3 { color: var(--text); line-height: 1.3; }
  a { color: var(--accent); }
  code {
    background: var(--code-bg);
    color: #e2e8f0;
    padding: 0.12rem 0.35rem;
    border-radius: 4px;
    font-size: 0.9em;
  }
  .code-container {
    position: relative;
    margin: 1rem 0;
  }
  .code-container pre {
    margin: 0;
  }
  .copy-btn {
    position: absolute;
    top: 0.5rem;
    right: 0.5rem;
    background: #1e293b;
    border: 1px solid var(--border);
    color: var(--muted);
    border-radius: 5px;
    padding: 0.25rem 0.55rem;
    font-size: 0.75rem;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    z-index: 5;
  }
  .copy-btn:hover {
    background: #334155;
    color: var(--text);
    border-color: var(--accent);
  }
  .copy-btn.copied {
    background: #064e3b;
    border-color: #10b981;
    color: #34d49a;
  }
  [dir="rtl"] .copy-btn {
    right: auto;
    left: 0.5rem;
  }
  pre {
    background: var(--code-bg);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.9rem 1rem;
    overflow-x: auto;
    direction: ltr;
    text-align: left;
  }
  pre code { background: transparent; padding: 0; }
  blockquote {
    border-inline-start: 4px solid var(--accent);
    background: rgba(56, 189, 248, 0.08);
    margin: 1rem 0;
    padding: 0.65rem 1rem;
    border-radius: 6px;
  }
  .table-wrap { overflow-x: auto; margin: 1rem 0; }
  table { border-collapse: collapse; width: 100%; font-size: 0.92rem; }
  th, td { border: 1px solid var(--border); padding: 0.5rem 0.65rem; text-align: start; }
  th { background: #0f172a; }
  footer {
    max-width: 1100px;
    margin: 0 auto 2rem;
    padding: 0 1.25rem;
    color: var(--muted);
    font-size: 0.85rem;
  }
</style>
</head>
<body>
<header>
  <div class="nav-inner">
    <a class="brand" href="${prefix}index.html">dz-sandbox</a>
    <nav aria-label="Primary documentation navigation">
      <a href="${prefix}SPEC_STATUS.html">${escapeHtml(labels.spec)}</a>
      <a href="${prefix}guides/common-integration-bugs.html">${escapeHtml(labels.bugs)}</a>
      <a href="${prefix}CONTRIBUTING-FIXTURES.html">${escapeHtml(labels.fixtures)}</a>
      <a href="${prefix}scenarios.html">${escapeHtml(labels.scenarios)}</a>
      <a href="${prefix}THREAT_MODEL.html">${escapeHtml(labels.threat)}</a>
    </nav>
    <div class="langs" aria-label="Language switcher">
      <a href="${prefix}index.ar.html" hreflang="ar">العربية</a>
      <a href="${prefix}index.fr.html" hreflang="fr">Français</a>
      <a href="${prefix}index.en.html" hreflang="en">English</a>
      <a href="https://github.com/test-bit-sys/dz-sandbox" target="_blank" rel="noopener noreferrer" class="gh-link">GitHub ⭐</a>
    </div>
  </div>
</header>
<div class="search-wrap">
  <input id="docs-search" type="search" placeholder="${escapeHtml(labels.searchPlaceholder)}" aria-label="${escapeHtml(labels.searchPlaceholder)}" />
  <kbd class="search-kbd">/</kbd>
  <div id="search-results" role="region" aria-live="polite"></div>
</div>
<main>
  <article>
    ${bodyHtml}
  </article>
</main>
<footer>
  dz-sandbox offline static documentation — Test what fails, not just what succeeds. Unofficial sandbox; not affiliated with Chargily, SATIM, Yalidine, or BaridiMob (Algérie Poste).
</footer>
<script src="${prefix}search-index.js"></script>
<script>
(function () {
  var input = document.getElementById("docs-search");
  var box = document.getElementById("search-results");
  var prefix = ${JSON.stringify(prefix)};
  var noResultsText = ${JSON.stringify(labels.noResults)};
  var copyLabel = ${JSON.stringify(labels.copy)};
  var copiedLabel = ${JSON.stringify(labels.copied)};

  if (input && box) {
    input.addEventListener("input", function () {
      var q = (input.value || "").trim().toLowerCase();
      if (!q) { box.style.display = "none"; box.innerHTML = ""; return; }
      var items = Array.isArray(window.__DZ_SEARCH_INDEX__) ? window.__DZ_SEARCH_INDEX__ : [];
      var hits = items.filter(function (entry) {
        return (entry.title + " " + entry.path + " " + entry.body).toLowerCase().indexOf(q) !== -1;
      }).slice(0, 12);
      box.style.display = "block";
      if (!hits.length) {
        box.innerHTML = "<div style='padding:0.4rem 0.6rem'>" + noResultsText + "</div>";
        return;
      }
      box.innerHTML = hits.map(function (hit) {
        return "<a href='" + prefix + hit.path + "'><strong>" +
          hit.title.replace(/</g, "&lt;") + "</strong><small>" +
          hit.path + " — " + hit.excerpt.replace(/</g, "&lt;") + "</small></a>";
      }).join("");
    });

    window.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
        input.select();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        input.focus();
        input.select();
      }
    });
  }

  // One-click copy button for code blocks
  document.querySelectorAll("pre").forEach(function (pre) {
    var wrapper = document.createElement("div");
    wrapper.className = "code-container";
    pre.parentNode.insertBefore(wrapper, pre);
    wrapper.appendChild(pre);

    var btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = copyLabel;
    btn.setAttribute("aria-label", copyLabel);
    btn.addEventListener("click", function () {
      var code = pre.querySelector("code") || pre;
      var text = code.innerText || code.textContent || "";
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = copiedLabel;
          btn.classList.add("copied");
          setTimeout(function () {
            btn.textContent = copyLabel;
            btn.classList.remove("copied");
          }, 1800);
        });
      }
    });
    wrapper.appendChild(btn);
  });
})();
</script>
    box.style.display = "block";
    if (!hits.length) {
      box.innerHTML = "<div style='padding:0.4rem 0.6rem'>" + noResultsText + "</div>";
      return;
    }
    box.innerHTML = hits.map(function (hit) {
      return "<a href='" + prefix + hit.path + "'><strong>" +
        hit.title.replace(/</g, "&lt;") + "</strong><small>" +
        hit.path + " — " + hit.excerpt.replace(/</g, "&lt;") + "</small></a>";
    }).join("");
  });
})();
</script>
</body>
</html>
`;
}

function buildSite() {
  const mdFiles = collectMarkdownFiles(DOCS_DIR);
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const searchIndex = [];
  const generatedHtmlPaths = [];

  for (const file of mdFiles) {
    const md = fs.readFileSync(file.absPath, "utf8");
    const parsed = markdownToHtml(md);
    const { lang, dir } = detectLanguage(file.relPath);
    const relHtmlPath = file.relPath.replace(/\.md$/, ".html");
    const outPath = path.join(OUT_DIR, relHtmlPath);

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const fullHtml = renderLayout({
      title: parsed.title,
      lang,
      dir,
      relHtmlPath,
      bodyHtml: parsed.html,
    });
    fs.writeFileSync(outPath, fullHtml, "utf8");
    generatedHtmlPaths.push(relHtmlPath);

    searchIndex.push({
      title: parsed.title,
      path: relHtmlPath,
      lang,
      headings: parsed.headings.map((h) => h.text),
      excerpt: parsed.plainText.slice(0, 140),
      body: parsed.plainText.slice(0, 6000),
    });
  }

  // Copy docs/assets if present
  const assetsDir = path.join(DOCS_DIR, "assets");
  if (fs.existsSync(assetsDir)) {
    fs.cpSync(assetsDir, path.join(OUT_DIR, "assets"), { recursive: true });
  }

  // Default root page is Arabic RTL (matching product Arabic default)
  const arIndexPath = path.join(OUT_DIR, "index.ar.html");
  if (!fs.existsSync(arIndexPath)) {
    throw new Error("Expected docs/index.ar.md to generate dist-docs/index.ar.html");
  }
  fs.copyFileSync(arIndexPath, path.join(OUT_DIR, "index.html"));
  generatedHtmlPaths.push("index.html");

  const indexJson = JSON.stringify(searchIndex, null, 2);
  fs.writeFileSync(path.join(OUT_DIR, "search-index.json"), indexJson, "utf8");
  fs.writeFileSync(
    path.join(OUT_DIR, "search-index.js"),
    `window.__DZ_SEARCH_INDEX__ = ${indexJson};\n`,
    "utf8"
  );

  return { mdFiles, generatedHtmlPaths, searchIndex };
}

function verifySite({ mdFiles, generatedHtmlPaths, searchIndex }) {
  const failures = [];

  if (generatedHtmlPaths.length < mdFiles.length + 1) {
    failures.push("Not all markdown files produced HTML output");
  }

  for (const reqFile of ["index.html", "index.ar.html", "index.fr.html", "index.en.html", "search-index.json", "search-index.js"]) {
    if (!fs.existsSync(path.join(OUT_DIR, reqFile))) {
      failures.push(`Missing required output file: ${reqFile}`);
    }
  }

  const indexHtml = fs.readFileSync(path.join(OUT_DIR, "index.html"), "utf8");
  const indexArHtml = fs.readFileSync(path.join(OUT_DIR, "index.ar.html"), "utf8");
  if (!indexHtml.includes('<html lang="ar" dir="rtl">') || !indexArHtml.includes('<html lang="ar" dir="rtl">')) {
    failures.push("Arabic default index.html / index.ar.html must declare lang=\"ar\" dir=\"rtl\"");
  }

  let linkCount = 0;
  for (const relHtml of generatedHtmlPaths) {
    const absHtml = path.join(OUT_DIR, relHtml);
    const html = fs.readFileSync(absHtml, "utf8");

    // Offline purity: zero external script/stylesheet links
    if (/<(?:script|link)\b[^>]+(?:src|href)=["']https?:\/\//i.test(html)) {
      failures.push(`External HTTP(S) asset detected in ${relHtml}`);
    }

    // Internal link integrity
    const hrefMatches = html.matchAll(/<a\b[^>]*\bhref="([^"]+)"/g);
    for (const match of hrefMatches) {
      const rawHref = match[1];
      if (!rawHref || rawHref.startsWith("#") || /^[a-z]+:/i.test(rawHref)) {
        continue;
      }
      linkCount++;
      const cleanHref = rawHref.split("#")[0];
      const resolved = path.resolve(path.dirname(absHtml), cleanHref);
      if (!resolved.startsWith(OUT_DIR) || !fs.existsSync(resolved)) {
        failures.push(`Broken internal link in ${relHtml}: ${rawHref} -> ${resolved}`);
      }
    }
  }

  for (const needle of ["duplicate_webhook", "contributing-fixtures", "THREAT_MODEL"]) {
    const found = searchIndex.some((entry) =>
      `${entry.title} ${entry.path} ${entry.body}`.toLowerCase().includes(needle.toLowerCase())
    );
    if (!found) {
      failures.push(`Search index missing expected query term: ${needle}`);
    }
  }

  if (failures.length > 0) {
    console.error("DOCS VERIFICATION FAILED:\n" + failures.map((f) => `- ${f}`).join("\n"));
    process.exit(1);
  }

  console.log(
    JSON.stringify({
      docsSite: "OK",
      pagesBuilt: generatedHtmlPaths.length,
      internalLinksVerified: linkCount,
      searchEntries: searchIndex.length,
      externalAssetRequests: 0,
      defaultLocale: "ar-rtl",
    })
  );
}

const result = buildSite();
if (process.argv.includes("--verify")) {
  verifySite(result);
} else {
  console.log(`Built ${result.generatedHtmlPaths.length} HTML docs pages into dist-docs/`);
}
