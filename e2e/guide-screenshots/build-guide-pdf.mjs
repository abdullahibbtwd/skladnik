#!/usr/bin/env node
/**
 * Build Oborotix tenant user guide PDF from docs/TENANT_USER_GUIDE.md
 * + annotated screenshots in e2e/guide-screenshots/output/.
 *
 * Usage (from e2e/):
 *   npm run guide:pdf
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const GUIDE_MD = path.join(ROOT, 'docs/TENANT_USER_GUIDE.md');
const OUT_DIR = process.env.GUIDE_OUT_DIR
  ? path.resolve(process.env.GUIDE_OUT_DIR)
  : path.join(__dirname, 'output');
const HTML_PATH = path.join(OUT_DIR, '_guide.html');
const PDF_PATH = path.join(OUT_DIR, 'Oborotix_User_Guide.pdf');

/** Screenshot filename prefix for each role heading in the markdown. */
const ROLE_FILE = {
  Owner: 'owner',
  'Site manager': 'site_manager',
  Staff: 'staff',
  Cashier: 'cashier',
  Accountant: 'accountant',
};

/** Map guide ### task title → harness task id (middle of screenshot filename). */
const TASK_IDS = {
  Owner: {
    'Add or edit a site': 'ownerSites',
    'Invite a team member': 'ownerInvite',
    'Photograph or receive a delivery': 'ownerReceive',
    'Post a document to stock': 'ownerPost',
    'Manage the product catalog': 'ownerProducts',
    'Transfer stock between sites': 'ownerTransfer',
    'Run a stocktake': 'ownerStocktake',
    'Sell at the till': 'ownerTill',
    'Run and export reports': 'ownerReports',
    'Work with VAT': 'ownerVat',
    'Post opening stock': 'ownerOpening',
    'Activate a subscription code': 'ownerSubscription',
  },
  'Site manager': {
    'Receive goods at your site': 'mgrReceive',
    'Post or reverse documents': 'mgrPost',
    'Write off stock': 'mgrWriteoff',
    'Transfer between sites': 'mgrTransfer',
    'Count stock': 'mgrStocktake',
    'Use the till': 'mgrTill',
    'Set minimum stock for reorder': 'mgrMinstock',
    'Maintain recipes (café / kitchen)': 'mgrRecipes',
    'Check reports and margins': 'mgrReports',
  },
  Staff: {
    'Photograph a supplier invoice': 'staffScan',
    'Enter a delivery without a photo': 'staffReceive',
    'Submit a receipt for review': 'staffSubmit',
    'Write off expired or damaged goods': 'staffWriteoff',
    'Check stock and expiry': 'staffStock',
    'Create a pending product from a scan line': 'staffPending',
    'Retry photos in the photo queue': 'staffQueue',
  },
  Cashier: {
    'Ring up a sale': 'cashTill',
    'Review your sales': 'cashSales',
    'Check stock or expiry before selling': 'cashStock',
  },
  Accountant: {
    'Export operational and financial reports': 'accReports',
    'Download original document scans': 'accArchive',
    'Prepare VAT filings': 'accVat',
    'Generate Annex 38 audit file': 'accAudit',
    'Review company sales': 'accSales',
    'Read documents and activity': 'accDocs',
  },
};

const ROLE_COLORS = {
  Owner: { accent: '#0f766e', soft: '#ecfdf5', ink: '#134e4a' },
  'Site manager': { accent: '#1d4ed8', soft: '#eff6ff', ink: '#1e3a8a' },
  Staff: { accent: '#c2410c', soft: '#fff7ed', ink: '#7c2d12' },
  Cashier: { accent: '#15803d', soft: '#f0fdf4', ink: '#14532d' },
  Accountant: { accent: '#334155', soft: '#f1f5f9', ink: '#0f172a' },
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function brandify(md) {
  return md
    .replace(/\bSkladnik\b/g, 'Oborotix')
    .replace(/^If your company uses Google sign-in, you can continue with Google instead\.\n*/m, '');
}

/** Inline markdown → HTML (bold, code, arrows kept as text). */
function inline(md) {
  let s = escapeHtml(md);
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  return s;
}

function loadMissing() {
  const missing = new Set();
  for (const file of fs.readdirSync(OUT_DIR).filter((f) => f.startsWith('_missing_') && f.endsWith('.json'))) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(OUT_DIR, file), 'utf8'));
      for (const id of raw.missingTargets ?? []) missing.add(id);
    } catch {
      // ignore bad missing files
    }
  }
  return missing;
}

function shotExists(roleFile, taskId, step, device) {
  const name = `${roleFile}_${taskId}_${String(step).padStart(2, '0')}_${device}.png`;
  return fs.existsSync(path.join(OUT_DIR, name)) ? name : null;
}

/**
 * Parse TENANT_USER_GUIDE.md into structured sections.
 * Roles are ## headings that match ROLE_FILE keys; tasks are ### under those.
 */
function parseGuide(md) {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const doc = {
    title: 'Help & User Guide',
    subtitle: '',
    gettingStarted: [],
    chooseRole: { intro: [], bullets: [] },
    roles: [],
    troubleshooting: [],
  };

  let i = 0;
  // Title
  if (lines[i]?.startsWith('# ')) {
    doc.title = lines[i].slice(2).trim();
    i += 1;
  }
  while (i < lines.length && !lines[i].startsWith('## ')) {
    const t = lines[i].trim();
    if (t && !t.startsWith('- [')) doc.subtitle += (doc.subtitle ? ' ' : '') + t;
    i += 1;
  }

  let mode = null; // getting-started | choose-role | role | troubleshooting
  let currentRole = null;
  let currentTask = null;
  let currentBlock = null; // { kind: 'p'|'steps'|'need'|'next'|'important'|'where'|'desktop-steps'|'mobile-steps', lines }

  const flushBlock = () => {
    if (!currentBlock) return;
    const target = currentTask || (mode === 'getting-started' ? { blocks: doc.gettingStarted } : null);
    if (mode === 'troubleshooting' && !currentTask) {
      // handled below
    } else if (currentTask) {
      currentTask.blocks.push(currentBlock);
    } else if (mode === 'getting-started' && currentBlock) {
      doc.gettingStarted.push(currentBlock);
    } else if (mode === 'choose-role' && currentBlock.kind === 'p') {
      doc.chooseRole.intro.push(...currentBlock.lines);
    }
    currentBlock = null;
  };

  const startTask = (title) => {
    flushBlock();
    currentTask = {
      title,
      id: slugify(title),
      taskId: currentRole ? TASK_IDS[currentRole.name]?.[title] ?? null : null,
      blocks: [],
    };
    if (mode === 'troubleshooting') {
      doc.troubleshooting.push(currentTask);
    } else if (currentRole) {
      currentRole.tasks.push(currentTask);
    }
  };

  while (i < lines.length) {
    const line = lines[i];
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);

    if (h2) {
      flushBlock();
      currentTask = null;
      currentRole = null;
      const title = h2[1].trim();
      if (title === 'Getting started') {
        mode = 'getting-started';
      } else if (title === 'Choose your role') {
        mode = 'choose-role';
      } else if (title === 'Troubleshooting') {
        mode = 'troubleshooting';
      } else if (title === 'Table of contents') {
        mode = 'skip';
      } else if (ROLE_FILE[title]) {
        mode = 'role';
        currentRole = {
          name: title,
          file: ROLE_FILE[title],
          colors: ROLE_COLORS[title],
          id: slugify(title),
          blurb: [],
          useSections: '',
          askWhen: '',
          tasks: [],
        };
        doc.roles.push(currentRole);
      } else {
        mode = 'skip';
      }
      i += 1;
      continue;
    }

    if (mode === 'skip') {
      i += 1;
      continue;
    }

    if (h3) {
      flushBlock();
      const title = h3[1].trim();
      if (mode === 'getting-started') {
        const section = { kind: 'subsection', title, id: slugify(title), blocks: [] };
        doc.gettingStarted.push(section);
        currentTask = section;
      } else if (mode === 'troubleshooting' || mode === 'role') {
        startTask(title);
      }
      i += 1;
      continue;
    }

    if (mode === 'choose-role') {
      const bullet = line.match(/^- \*\*(.+?)\*\* — (.+)/);
      if (bullet) {
        doc.chooseRole.bullets.push({ role: bullet[1], text: bullet[2] });
        i += 1;
        continue;
      }
      if (line.trim() && !line.startsWith('---') && !line.startsWith('Jump to')) {
        doc.chooseRole.intro.push(line.trim());
      }
      i += 1;
      continue;
    }

    if (mode === 'role' && currentRole && !currentTask) {
      const use = line.match(/^\*\*Use these sections:\*\* (.+)/);
      const ask = line.match(/^\*\*Ask this role when:\*\* (.+)/);
      if (use) currentRole.useSections = use[1];
      else if (ask) currentRole.askWhen = ask[1];
      else if (line.trim() && !line.startsWith('---') && !line.startsWith('**')) {
        currentRole.blurb.push(line.trim());
      }
      i += 1;
      continue;
    }

    // Block content under a subsection/task
    if (!currentTask && mode !== 'getting-started') {
      i += 1;
      continue;
    }

    if (line.startsWith('**Where:**')) {
      flushBlock();
      currentBlock = { kind: 'where', lines: [line.replace(/^\*\*Where:\*\*\s*/, '')] };
      i += 1;
      continue;
    }
    if (line.trim() === '**Desktop**') {
      flushBlock();
      currentBlock = { kind: 'desktop-steps', lines: [] };
      i += 1;
      continue;
    }
    if (line.trim() === '**Mobile**') {
      flushBlock();
      currentBlock = { kind: 'mobile-steps', lines: [] };
      i += 1;
      continue;
    }
    if (line.trim() === '**What you need**') {
      flushBlock();
      currentBlock = { kind: 'need', lines: [] };
      i += 1;
      continue;
    }
    if (line.startsWith('**What happens next:**')) {
      flushBlock();
      currentBlock = { kind: 'next', lines: [line.replace(/^\*\*What happens next:\*\*\s*/, '')] };
      i += 1;
      continue;
    }
    if (line.startsWith('**Why it happens:**')) {
      flushBlock();
      currentBlock = { kind: 'why', lines: [line.replace(/^\*\*Why it happens:\*\*\s*/, '')] };
      i += 1;
      continue;
    }
    if (line.startsWith('**What to do:**')) {
      flushBlock();
      currentBlock = { kind: 'todo', lines: [line.replace(/^\*\*What to do:\*\*\s*/, '')] };
      i += 1;
      continue;
    }
    if (line.startsWith('> **Important**')) {
      flushBlock();
      currentBlock = { kind: 'important', lines: [] };
      i += 1;
      continue;
    }
    if (line.match(/^\d+\.\s/)) {
      if (!currentBlock || !['steps', 'desktop-steps', 'mobile-steps'].includes(currentBlock.kind)) {
        flushBlock();
        currentBlock = { kind: 'steps', lines: [] };
      }
      currentBlock.lines.push(line.replace(/^\d+\.\s*/, ''));
      i += 1;
      continue;
    }
    if (line.match(/^- /) && currentBlock?.kind === 'need') {
      currentBlock.lines.push(line.replace(/^- /, ''));
      i += 1;
      continue;
    }
    if (line.match(/^>\s*-?\s*/) && currentBlock?.kind === 'important') {
      const t = line.replace(/^>\s*/, '').replace(/^- /, '').trim();
      if (t) currentBlock.lines.push(t);
      i += 1;
      continue;
    }
    if (line.trim() === '---' || line.trim() === '') {
      flushBlock();
      i += 1;
      continue;
    }
    if (line.trim()) {
      if (!currentBlock || currentBlock.kind !== 'p') {
        flushBlock();
        currentBlock = { kind: 'p', lines: [] };
      }
      currentBlock.lines.push(line.trim());
    }
    i += 1;
  }
  flushBlock();
  return doc;
}

/** Flatten step texts for a task (Desktop/Mobile labelled when split). */
function taskSteps(task) {
  const out = [];
  for (const b of task.blocks) {
    if (b.kind === 'steps') {
      for (const line of b.lines) out.push({ text: line, device: null });
    } else if (b.kind === 'desktop-steps') {
      for (const line of b.lines) out.push({ text: line, device: 'Desktop' });
    } else if (b.kind === 'mobile-steps') {
      for (const line of b.lines) out.push({ text: line, device: 'Mobile' });
    }
  }
  return out;
}

/** Max step index that has a screenshot (or guide step count). */
function screenshotSteps(roleFile, taskId) {
  if (!taskId) return [];
  const steps = [];
  for (let n = 1; n <= 12; n++) {
    const desk = shotExists(roleFile, taskId, n, 'desktop');
    const mob = shotExists(roleFile, taskId, n, 'mobile');
    if (!desk && !mob) {
      if (n > 1) break;
      continue;
    }
    steps.push(n);
  }
  return steps;
}

function renderBlocks(blocks) {
  let html = '';
  for (const b of blocks) {
    if (b.kind === 'where') {
      html += `<p class="where"><span class="label">Where</span> ${inline(b.lines.join(' '))}</p>`;
    } else if (b.kind === 'p') {
      html += `<p>${inline(b.lines.join(' '))}</p>`;
    } else if (b.kind === 'need') {
      html += `<div class="need"><h4>What you need</h4><ul>${b.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</ul></div>`;
    } else if (b.kind === 'next') {
      html += `<p class="next"><span class="label">What happens next</span> ${inline(b.lines.join(' '))}</p>`;
    } else if (b.kind === 'why') {
      html += `<p class="why"><span class="label">Why it happens</span> ${inline(b.lines.join(' '))}</p>`;
    } else if (b.kind === 'todo') {
      html += `<p class="todo"><span class="label">What to do</span> ${inline(b.lines.join(' '))}</p>`;
    } else if (b.kind === 'important') {
      html += `<aside class="important"><strong>Important</strong><ul>${b.lines.map((l) => `<li>${inline(l)}</li>`).join('')}</ul></aside>`;
    }
  }
  return html;
}

function renderStepList(steps) {
  if (!steps.length) return '';
  return `<ol class="steps">${steps
    .map((s) => {
      const prefix = s.device ? `<span class="dev-tag">${s.device}</span> ` : '';
      return `<li>${prefix}${inline(s.text)}</li>`;
    })
    .join('')}</ol>`;
}

function renderShots(roleFile, taskId, missing) {
  if (!taskId) return '';
  const stepNums = screenshotSteps(roleFile, taskId);
  if (!stepNums.length) return '';

  const desktop = [];
  const mobile = [];
  for (const n of stepNums) {
    const idDesk = `${roleFile}_${taskId}_${String(n).padStart(2, '0')}_desktop`;
    const idMob = `${roleFile}_${taskId}_${String(n).padStart(2, '0')}_mobile`;
    const deskFile = missing.has(idDesk) ? null : shotExists(roleFile, taskId, n, 'desktop');
    const mobFile = missing.has(idMob) ? null : shotExists(roleFile, taskId, n, 'mobile');
    if (deskFile) {
      desktop.push(
        `<figure><img src="${deskFile}" alt="Step ${n} desktop" /><figcaption>Step ${n} · Desktop</figcaption></figure>`,
      );
    }
    if (mobFile) {
      mobile.push(
        `<figure><img src="${mobFile}" alt="Step ${n} mobile" /><figcaption>Step ${n} · Mobile</figcaption></figure>`,
      );
    }
  }
  if (!desktop.length && !mobile.length) return '';

  let html = `<div class="shots">`;
  if (desktop.length) {
    html += `<div class="shots-desktop">${desktop.join('')}</div>`;
  }
  if (mobile.length) {
    html += `<div class="shots-mobile">${mobile.join('')}</div>`;
  }
  html += `</div>`;
  return html;
}

function buildHtml(doc, missing) {
  const tocRoles = doc.roles
    .map((r) => {
      const tasks = r.tasks
        .map((t) => `<li><a href="#${r.id}-${t.id}">${escapeHtml(t.title)}</a></li>`)
        .join('');
      return `<li class="toc-role" style="--accent:${r.colors.accent}"><a href="#${r.id}">${escapeHtml(r.name)}</a><ol>${tasks}</ol></li>`;
    })
    .join('');

  const gsSections = doc.gettingStarted.filter((b) => b.kind === 'subsection');

  const chooseHtml = `
    <section class="chapter" id="choose-your-role">
      <h2>Choose your role</h2>
      ${doc.chooseRole.intro.map((p) => `<p>${inline(p)}</p>`).join('')}
      <ul class="role-cards">
        ${doc.chooseRole.bullets
          .map((b) => {
            const colors = ROLE_COLORS[b.role] ?? ROLE_COLORS.Owner;
            const id = slugify(b.role);
            return `<li style="--accent:${colors.accent};--soft:${colors.soft}">
              <a href="#${id}"><strong>${escapeHtml(b.role)}</strong></a>
              <span>${inline(b.text)}</span>
            </li>`;
          })
          .join('')}
      </ul>
    </section>`;

  const rolesHtml = doc.roles
    .map((r) => {
      const tasks = r.tasks
        .map((t) => {
          const steps = taskSteps(t);
          const meta = renderBlocks(t.blocks.filter((b) => !['steps', 'desktop-steps', 'mobile-steps'].includes(b.kind)));
          // Put need/next/important after steps in natural order via full block render excluding steps
          const before = renderBlocks(
            t.blocks.filter((b) => ['where', 'p'].includes(b.kind)),
          );
          const after = renderBlocks(
            t.blocks.filter((b) => ['need', 'next', 'important'].includes(b.kind)),
          );
          return `<article class="task" id="${r.id}-${t.id}">
            <h3><span class="task-mark"></span>${escapeHtml(t.title)}</h3>
            ${before}
            ${renderStepList(steps)}
            ${renderShots(r.file, t.taskId, missing)}
            ${after}
          </article>`;
        })
        .join('');

      return `<section class="role" id="${r.id}" style="--accent:${r.colors.accent};--soft:${r.colors.soft};--ink:${r.colors.ink}">
        <header class="role-head">
          <p class="eyebrow">Role guide</p>
          <h2>${escapeHtml(r.name)}</h2>
          ${r.blurb.map((p) => `<p class="blurb">${inline(p)}</p>`).join('')}
          ${r.useSections ? `<p class="meta"><span class="label">Use these sections</span> ${inline(r.useSections)}</p>` : ''}
          ${r.askWhen ? `<p class="meta"><span class="label">Ask this role when</span> ${inline(r.askWhen)}</p>` : ''}
        </header>
        ${tasks}
      </section>`;
    })
    .join('');

  const troubleHtml = `
    <section class="chapter" id="troubleshooting">
      <h2>Troubleshooting</h2>
      ${doc.troubleshooting
        .map(
          (t) => `<article class="trouble" id="ts-${t.id}">
          <h3>${escapeHtml(t.title)}</h3>
          ${renderBlocks(t.blocks)}
        </article>`,
        )
        .join('')}
    </section>`;

  const date = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'long', day: 'numeric' });

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Oborotix — User Guide</title>
<style>
  @page { size: A4; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body {
    margin: 0;
    font: 10.5pt/1.45 "Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif;
    color: #1e293b;
    background: #fff;
  }
  a { color: inherit; }
  code { font-size: 0.92em; background: #f1f5f9; padding: 0.05em 0.3em; border-radius: 3px; }

  /* Cover */
  .cover {
    min-height: 250mm;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    padding: 18mm 8mm 22mm;
    page-break-after: always;
    background:
      radial-gradient(120% 80% at 100% 0%, #ccfbf1 0%, transparent 55%),
      radial-gradient(90% 70% at 0% 100%, #e0f2fe 0%, transparent 50%),
      linear-gradient(165deg, #0f766e 0%, #134e4a 42%, #0f172a 100%);
    color: #f8fafc;
    border-radius: 0;
  }
  .cover .brand {
    font-size: 42pt;
    font-weight: 750;
    letter-spacing: -0.03em;
    margin: 0 0 10mm;
  }
  .cover h1 {
    font-size: 26pt;
    font-weight: 650;
    margin: 0 0 4mm;
    letter-spacing: -0.02em;
  }
  .cover .lede {
    max-width: 120mm;
    font-size: 12pt;
    opacity: 0.92;
    margin: 0 0 18mm;
  }
  .cover .meta-line {
    font-size: 9.5pt;
    opacity: 0.75;
    border-top: 1px solid rgba(248,250,252,0.35);
    padding-top: 4mm;
  }

  /* TOC */
  .toc {
    page-break-after: always;
  }
  .toc h2 { font-size: 18pt; margin: 0 0 6mm; color: #0f172a; }
  .toc > ol { list-style: none; padding: 0; margin: 0; }
  .toc > ol > li { margin: 0 0 3mm; }
  .toc > ol > li > a {
    font-weight: 650;
    font-size: 11.5pt;
    text-decoration: none;
    color: #0f766e;
  }
  .toc-role { margin: 4mm 0 2mm !important; padding-left: 3mm; border-left: 3px solid var(--accent); }
  .toc-role > a { color: var(--accent) !important; }
  .toc-role ol {
    list-style: none;
    padding: 1.5mm 0 0 3mm;
    margin: 0;
    columns: 2;
    column-gap: 6mm;
  }
  .toc-role ol li { break-inside: avoid; margin: 0.6mm 0; }
  .toc-role ol a {
    font-weight: 400;
    font-size: 9.5pt;
    text-decoration: none;
    color: #334155;
  }

  .chapter, .role { page-break-before: always; }
  .chapter h2, .role-head h2 {
    font-size: 18pt;
    margin: 0 0 3mm;
    letter-spacing: -0.02em;
  }
  .eyebrow {
    margin: 0 0 1mm;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--accent, #0f766e);
  }
  .role-head {
    background: var(--soft);
    border: 1px solid color-mix(in srgb, var(--accent) 28%, #e2e8f0);
    border-left: 5px solid var(--accent);
    padding: 5mm 5mm 4mm;
    margin: 0 0 6mm;
    border-radius: 2mm;
  }
  .role-head .blurb { margin: 0 0 2mm; color: var(--ink); }
  .meta { margin: 1.5mm 0 0; font-size: 9.5pt; color: #475569; }
  .label {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--accent, #0f766e);
    margin-right: 1.5mm;
  }

  .role-cards { list-style: none; padding: 0; margin: 4mm 0 0; display: grid; gap: 2.5mm; }
  .role-cards li {
    display: grid;
    grid-template-columns: 32mm 1fr;
    gap: 3mm;
    align-items: start;
    padding: 3mm 3.5mm;
    background: var(--soft);
    border-left: 4px solid var(--accent);
    border-radius: 1.5mm;
  }
  .role-cards a { text-decoration: none; color: var(--accent); font-size: 11pt; }

  .task {
    margin: 0 0 7mm;
    padding-bottom: 5mm;
    border-bottom: 1px solid #e2e8f0;
    break-inside: avoid;
  }
  .task:last-child { border-bottom: 0; }
  .task h3 {
    font-size: 13pt;
    margin: 0 0 2.5mm;
    color: var(--ink, #0f172a);
    display: flex;
    align-items: center;
    gap: 2mm;
  }
  .task-mark {
    width: 2.2mm;
    height: 2.2mm;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
  }
  .where, .next, .why, .todo { margin: 1.5mm 0; }
  .steps {
    margin: 3mm 0;
    padding-left: 5mm;
  }
  .steps li { margin: 1.2mm 0; }
  .dev-tag {
    display: inline-block;
    font-size: 7.5pt;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: #fff;
    background: #64748b;
    padding: 0.3mm 1.5mm;
    border-radius: 1mm;
    margin-right: 1mm;
    vertical-align: 0.5pt;
  }
  .need { margin: 2mm 0; }
  .need h4 { margin: 0 0 1mm; font-size: 9pt; color: #64748b; text-transform: uppercase; letter-spacing: 0.06em; }
  .need ul { margin: 0; padding-left: 5mm; }
  .important {
    margin: 3mm 0 0;
    padding: 2.5mm 3mm;
    background: #fffbeb;
    border: 1px solid #fde68a;
    border-radius: 1.5mm;
    font-size: 9.5pt;
  }
  .important ul { margin: 1mm 0 0; padding-left: 4.5mm; }

  .shots { margin: 4mm 0 2mm; }
  .shots-desktop {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3mm;
    margin-bottom: 3mm;
  }
  .shots-desktop figure, .shots-mobile figure {
    margin: 0;
    break-inside: avoid;
  }
  .shots-desktop img {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid #cbd5e1;
    border-radius: 1.5mm;
    background: #f8fafc;
  }
  .shots-mobile {
    display: flex;
    flex-wrap: wrap;
    gap: 2.5mm;
    align-items: flex-start;
  }
  .shots-mobile figure {
    width: 28mm;
    flex: 0 0 28mm;
  }
  .shots-mobile img {
    width: 100%;
    height: auto;
    display: block;
    border: 1px solid #cbd5e1;
    border-radius: 3mm;
    background: #f8fafc;
  }
  figcaption {
    margin-top: 1mm;
    font-size: 7.5pt;
    color: #64748b;
    text-align: center;
  }

  .sub { margin: 0 0 5mm; }
  .sub h3 { font-size: 12pt; margin: 0 0 2mm; color: #0f766e; }
  .trouble { margin: 0 0 4mm; padding-bottom: 3mm; border-bottom: 1px solid #e2e8f0; }
  .trouble h3 { font-size: 11.5pt; margin: 0 0 2mm; }

  .gs-intro { margin-bottom: 4mm; }
</style>
</head>
<body>
  <section class="cover">
    <div class="brand">Oborotix</div>
    <h1>User Guide</h1>
    <p class="lede">${inline(doc.subtitle || 'How to use Oborotix for your role — sign in, daily tasks, and what to do when something is missing.')}</p>
    <p class="meta-line">Tenant roles · Desktop &amp; mobile · ${escapeHtml(date)}</p>
  </section>

  <nav class="toc" id="contents">
    <h2>Contents</h2>
    <ol>
      <li><a href="#getting-started">Getting started</a></li>
      <li><a href="#choose-your-role">Choose your role</a></li>
      ${tocRoles}
      <li><a href="#troubleshooting">Troubleshooting</a></li>
    </ol>
  </nav>

  <section class="chapter" id="getting-started">
    <h2>Getting started</h2>
    <div class="gs-intro">
      ${gsSections
        .map(
          (s) => `<section class="sub" id="gs-${s.id}">
          <h3>${escapeHtml(s.title)}</h3>
          ${renderBlocks(s.blocks.filter((b) => !['steps', 'desktop-steps', 'mobile-steps'].includes(b.kind)))}
          ${renderStepList(taskSteps(s))}
        </section>`,
        )
        .join('')}
    </div>
  </section>

  ${chooseHtml}
  ${rolesHtml}
  ${troubleHtml}
</body>
</html>`;
}

async function main() {
  if (!fs.existsSync(GUIDE_MD)) throw new Error(`Guide not found: ${GUIDE_MD}`);
  if (!fs.existsSync(OUT_DIR)) throw new Error(`Screenshot output not found: ${OUT_DIR}`);

  const md = brandify(fs.readFileSync(GUIDE_MD, 'utf8'));
  const doc = parseGuide(md);
  const missing = loadMissing();
  const html = buildHtml(doc, missing);
  fs.writeFileSync(HTML_PATH, html, 'utf8');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`file://${HTML_PATH}`, { waitUntil: 'networkidle' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="width:100%;font-size:8px;color:#64748b;padding:0 12mm;display:flex;justify-content:space-between;">
        <span>Oborotix User Guide</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>`,
    margin: { top: '12mm', bottom: '16mm', left: '12mm', right: '12mm' },
  });
  await browser.close();

  const stats = fs.statSync(PDF_PATH);
  console.log(`Wrote ${PDF_PATH} (${Math.round(stats.size / 1024)} KB)`);
  console.log(`Roles: ${doc.roles.map((r) => `${r.name} (${r.tasks.length} tasks)`).join(', ')}`);
  console.log(`Missing screenshot IDs skipped: ${missing.size}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
