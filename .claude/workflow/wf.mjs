#!/usr/bin/env node
// Steuerung des Feature-Workflows. Aufruf: node .claude/workflow/wf.mjs <befehl>
import fs from 'node:fs';
import path from 'node:path';
import {
  ROOT, WF_DIR, FEATURES_DIR, PHASES, ARTIFACTS, WF, NEXT_STEPS,
  loadConfig, loadState, saveState, activeFeature, readArtifact, artifactPath, logEvent,
  gateWithApproval, formatReport, sha, isGitRepo, headCommit, changedFiles, diffHash, diffText,
  prodFingerprint, ticketAcIds, checkAllowGreen, exceptionsSection,
} from './lib.mjs';

const USAGE = `Feature-Workflow – Befehle:
  start <slug> "<Titel>"         Neues Feature anlegen (Phase spec)
  status                         Aktives Feature, Phase, nächster Schritt
  check                          Gate der aktuellen Phase prüfen (ändert nichts)
  advance                        Gate prüfen und bei Erfolg in die nächste Phase wechseln
  back <phase> --reason "..."    Zurück in eine frühere Phase (spec|plan|tests|implement)
  allow-green --reason "..."     Red-Ausnahme nach Rücksprung in "tests": nur Testdateien geändert,
                                 Suite grün, keine neue AC. Begründung erscheint im Review.
  diff [--summary]               Code-Änderungen seit Feature-Start + Diff-Hash (für Review)
  list                           Alle Features
  resume <id>                    Ein nicht abgeschlossenes Feature wieder aktivieren
  abort --reason "..."           Aktives Feature abbrechen`;

const [cmd, ...args] = process.argv.slice(2);
const cfg = loadConfig();
const state = loadState();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function option(name) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1] ?? null;
}

function requireActive() {
  const f = activeFeature(state);
  if (!f) fail(`Kein aktives Feature. Starten mit: ${WF} start <slug> "<Titel>"`);
  return f;
}

const nextPhase = (p) => PHASES[PHASES.indexOf(p) + 1];

function printExceptions(f) {
  const list = f.exceptions ?? [];
  if (list.length) console.log(`Workflow-Ausnahmen (${list.length}):\n${list.map((e) => `  - ${e.ts}  ${e.type} (${e.phase}): ${e.reason}`).join('\n')}`);
}

function printStatus(f) {
  console.log(`Feature ${f.id} – ${f.title}`);
  console.log(`Phase:    ${f.phase} (${PHASES.indexOf(f.phase) + 1}/${PHASES.length})  ${PHASES.map((p) => (p === f.phase ? `[${p}]` : p)).join(' → ')}`);
  console.log(`Ordner:   ${f.dir}`);
  console.log(`Versuche: ${f.attempts}/${cfg.max_attempts}${f.escalated ? ' (ESKALIERT – Nutzer muss eingreifen)' : ''}   Review-Runden: ${f.review_rounds}/${cfg.max_review_rounds + f.extra_rounds}`);
  if (f.red_exception) console.log(`Red-Ausnahme aktiv (${f.red_exception.ts}): ${f.red_exception.reason}`);
  printExceptions(f);
  console.log(`Nächster Schritt: ${NEXT_STEPS[f.phase]}`);
}

const commands = {
  start() {
    const [slug, title] = args;
    if (!slug || !/^[a-z0-9-]+$/.test(slug)) fail('Aufruf: start <slug> "<Titel>"  (slug: a-z, 0-9, -)');
    if (!isGitRepo()) fail('Der Workflow braucht ein git-Repository (für Diff und Review).');
    const current = activeFeature(state);
    if (current) fail(`Feature ${current.id} ist noch aktiv (Phase ${current.phase}). Erst abschließen oder \`${WF} abort --reason "..."\`.`);

    // Nummer aus Zustand UND vorhandenen Ordnern (state.json ist evtl. per .gitignore lokal).
    const existingDirs = fs.existsSync(FEATURES_DIR) ? fs.readdirSync(FEATURES_DIR) : [];
    const used = [...Object.keys(state.features), ...existingDirs].map((s) => Number(s.match(/^F(\d+)/)?.[1] ?? 0));
    const n = Math.max(0, ...used) + 1;
    const id = `F${String(n).padStart(3, '0')}`;
    const dir = path.posix.join('.workflow/features', `${id}-${slug}`);
    fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
    const fill = (t) => t.replaceAll('__ID__', id).replaceAll('__TITLE__', title || slug).replaceAll('__DATE__', new Date().toISOString().slice(0, 10));
    fs.writeFileSync(path.join(ROOT, dir, 'ticket.md'), fill(fs.readFileSync(path.join(WF_DIR, 'templates', 'ticket.md'), 'utf8')));

    const feature = {
      id, slug, title: title || slug, dir, phase: 'spec', base: headCommit(),
      created: new Date().toISOString(), approvals: {}, hashes: {}, attempts: 0, escalated: false,
      review_rounds: 0, extra_rounds: 0, test_snapshot: null, reviewer_hash: null, history: [],
    };
    logEvent(feature, 'start');
    state.features[id] = feature;
    state.active = id;
    saveState(state);

    const dirty = changedFiles(feature.base);
    if (dirty.length) console.log(`WARNUNG: ${dirty.length} uncommittete Änderung(en) vorhanden – sie zählen zum Diff dieses Features:\n  ${dirty.slice(0, 10).join('\n  ')}`);
    console.log(`Feature ${id} angelegt: ${dir}/ticket.md`);
    printStatus(feature);
  },

  status() {
    const f = activeFeature(state);
    if (!f) return console.log(`Kein aktives Feature. Starten mit: ${WF} start <slug> "<Titel>"`);
    printStatus(f);
  },

  check() {
    const f = requireActive();
    if (f.phase === 'done') return console.log('Feature ist abgeschlossen.');
    const res = gateWithApproval(f, cfg);
    console.log(formatReport(f, res));
    process.exit(res.errors.length || res.pending.length ? 1 : 0);
  },

  advance() {
    const f = requireActive();
    const res = gateWithApproval(f, cfg);
    console.log(formatReport(f, res));
    if (res.errors.length || res.pending.length) process.exit(1);

    const from = f.phase;
    if (ARTIFACTS[from] && from !== 'review') f.hashes[from] = sha(readArtifact(f, from));
    if (from === 'tests') {
      f.test_snapshot = res.data.snapshot;
      // Eine genutzte Red-Ausnahme bleibt dauerhaft dokumentiert (Review, diff, status).
      if (f.red_exception) {
        const { ts, reason, diff_hash } = f.red_exception;
        f.exceptions = [...(f.exceptions ?? []), { ts, phase: 'tests', type: 'allow-green', reason, diff_hash }];
        delete f.red_exception;
      }
      delete f.retest_base;
    }
    const to = nextPhase(from);
    f.phase = to;
    f.attempts = 0;
    f.escalated = false;
    logEvent(f, 'advance', { from, to });

    if (to === 'plan' || to === 'review') {
      const template = path.join(WF_DIR, 'templates', ARTIFACTS[to]);
      const target = artifactPath(f, to);
      if (!fs.existsSync(target)) {
        let text = fs.readFileSync(template, 'utf8').replaceAll('__ID__', f.id).replaceAll('__TITLE__', f.title);
        if (to === 'review') {
          const extra = exceptionsSection(f);
          if (extra) text = text.includes('\n## Fazit') ? text.replace('\n## Fazit', `\n${extra}## Fazit`) : `${text.trimEnd()}\n\n${extra}`;
        }
        fs.writeFileSync(target, text);
      }
    }
    if (to === 'done') {
      f.completed = new Date().toISOString();
      state.active = null;
    }
    saveState(state);
    console.log(`\n${from} → ${to}`);
    console.log(`Nächster Schritt: ${NEXT_STEPS[to]}`);
  },

  back() {
    const f = requireActive();
    const target = args[0];
    const reason = option('reason');
    const ti = PHASES.indexOf(target);
    if (ti === -1 || ti >= PHASES.indexOf(f.phase)) fail(`Zielphase muss vor "${f.phase}" liegen: ${PHASES.slice(0, PHASES.indexOf(f.phase)).join(', ')}`);
    if (!reason) fail('Begründung fehlt: --reason "..."');

    if (f.phase === 'review') {
      if (f.review_rounds >= cfg.max_review_rounds + f.extra_rounds) {
        fail(`Maximale Anzahl Review-Runden (${f.review_rounds}) erreicht. STOPP: Dem Nutzer die offenen Befunde zeigen. Er kann mit "weitere runde" eine zusätzliche Runde erlauben.`);
      }
      f.review_rounds++;
      const review = artifactPath(f, 'review');
      if (fs.existsSync(review)) fs.renameSync(review, review.replace(/\.md$/, `-runde-${f.review_rounds}.md`));
    }
    // Stand beim Rücksprung aus implement/review nach tests festhalten: Grundlage für allow-green.
    const ts = new Date().toISOString();
    delete f.red_exception;
    if (target === 'tests' && ['implement', 'review'].includes(f.phase)) {
      f.retest_base = { ts, from: f.phase, prod: prodFingerprint(f, cfg), acs: ticketAcIds(f), tests: f.test_snapshot };
    } else {
      delete f.retest_base;
    }
    // Alles ab der Zielphase ist ungültig und muss neu durchlaufen werden.
    for (const p of PHASES.slice(ti)) { delete f.hashes[p]; delete f.approvals[p]; }
    if (ti <= PHASES.indexOf('tests')) f.test_snapshot = null;
    f.reviewer_hash = null;
    const from = f.phase;
    f.phase = target;
    f.attempts = 0;
    f.escalated = false;
    f.history.push({ ts, phase: target, event: 'back', from, to: target, reason });
    saveState(state);
    console.log(`${from} → ${target} (Grund: ${reason})`);
    console.log(`Nächster Schritt: ${NEXT_STEPS[target]}`);
  },

  'allow-green'() {
    const f = requireActive();
    const reason = option('reason')?.trim();
    if (!reason || reason.length < cfg.min_reason_length) {
      fail(`Begründung fehlt oder ist zu kurz: --reason "..." (mindestens ${cfg.min_reason_length} Zeichen; sie erscheint im Review).`);
    }
    const res = checkAllowGreen(f, cfg);
    console.log(formatReport(f, res));
    if (res.errors.length) process.exit(1);

    f.red_exception = { ts: new Date().toISOString(), reason, diff_hash: res.data.diff_hash, retest_from: res.data.base_ts };
    logEvent(f, 'allow-green', { reason, diff_hash: res.data.diff_hash });
    saveState(state);
    console.log(`\nRed-Ausnahme erteilt für Code-Stand ${res.data.diff_hash}. Sie gilt nur, solange sich der Code nicht ändert.`);
    console.log(`Nächster Schritt: \`${WF} advance\``);
  },

  diff() {
    const f = requireActive();
    const files = changedFiles(f.base);
    console.log(`Diff-Hash: ${diffHash(f.base)}`);
    console.log(`Basis:     ${f.base.slice(0, 12)}`);
    printExceptions(f);
    console.log(`Geänderte Dateien (${files.length}):\n  ${files.join('\n  ')}\n`);
    if (!args.includes('--summary')) console.log(diffText(f.base));
  },

  list() {
    const all = Object.values(state.features);
    if (!all.length) return console.log('Noch keine Features.');
    for (const f of all) console.log(`${f.id === state.active ? '*' : ' '} ${f.id}  ${f.phase.padEnd(9)}  ${f.title}${f.aborted ? '  (abgebrochen)' : ''}`);
  },

  resume() {
    const f = state.features[args[0]];
    if (!f) fail(`Unbekanntes Feature: ${args[0]}`);
    if (f.phase === 'done') fail(`${f.id} ist bereits abgeschlossen.`);
    if (state.active && state.active !== f.id) fail(`Feature ${state.active} ist aktiv. Erst abschließen oder abbrechen.`);
    delete f.aborted;
    state.active = f.id;
    logEvent(f, 'resume');
    saveState(state);
    printStatus(f);
  },

  abort() {
    const f = requireActive();
    const reason = option('reason');
    if (!reason) fail('Begründung fehlt: --reason "..."');
    f.aborted = true;
    logEvent(f, 'abort', { reason });
    state.active = null;
    saveState(state);
    console.log(`Feature ${f.id} abgebrochen. Fortsetzen mit: ${WF} resume ${f.id}`);
  },
};

if (!commands[cmd]) {
  console.log(USAGE);
  process.exit(cmd ? 1 : 0);
}
commands[cmd]();
