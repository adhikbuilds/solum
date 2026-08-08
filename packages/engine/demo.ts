/**
 * Runnable demonstration: the beta's own numbers, before and after.
 *
 *   pnpm demo
 */
import { appraise } from './src/appraise.js';
import { formatAed, toAed, type Fils } from './src/money.js';
import { betaAppraisal, betaUnits } from './test/fixtures.js';
import type { AppraisalResult } from './src/types.js';

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const OFF = '\x1b[0m';

function psf(v: Fils | null): string {
  return v === null ? '—' : `AED ${(Number(v) / 100).toFixed(2)}/sqft`;
}

function pct(v: number | null): string {
  return v === null ? '—' : `${(v * 100).toFixed(1)}%`;
}

function verdictColour(v: string): string {
  if (v === 'PASS') return GREEN;
  if (v === 'NO_VERDICT') return RED;
  if (v === 'FAIL') return RED;
  return YELLOW;
}

function report(title: string, result: AppraisalResult): void {
  console.log(`\n${BOLD}${'━'.repeat(78)}${OFF}`);
  console.log(`${BOLD}${title}${OFF}`);
  console.log(`${BOLD}${'━'.repeat(78)}${OFF}\n`);

  console.log(`  Blended price          ${psf(result.outputs.blendedPricePsf)}`);
  console.log(`  Gross development value ${formatAed(result.outputs.grossDevelopmentValue)}`);
  console.log(`  Total development cost  ${formatAed(result.outputs.totalDevelopmentCost)}`);
  console.log(`  Residual land value     ${formatAed(result.outputs.residualLandValue)}`);
  console.log(`  Net profit              ${result.outputs.netProfit === null ? '—' : formatAed(result.outputs.netProfit)}`);
  console.log(`  Profit on cost          ${pct(result.outputs.profitOnCost)}`);

  console.log(`\n  ${DIM}Scenarios${OFF}`);
  for (const s of result.outputs.scenarios) {
    const colour = (s.profitOnCost ?? 0) < 0 ? RED : GREEN;
    console.log(
      `    ${s.name.padEnd(10)} ${colour}${pct(s.profitOnCost).padStart(7)}${OFF} on cost` +
        `   ${DIM}profit ${formatAed(s.netProfit)}${OFF}`,
    );
  }

  const c = verdictColour(result.verdict);
  console.log(`\n  ${BOLD}VERDICT  ${c}${result.verdict}${OFF}`);
  console.log(`  ${DIM}${wrap(result.verdictReason, 74, '  ')}${OFF}`);

  if (result.flags.length > 0) {
    console.log(`\n  ${BOLD}Flags${OFF}`);
    for (const f of result.flags) {
      const colour = f.severity === 'blocker' ? RED : f.severity === 'warn' ? YELLOW : CYAN;
      console.log(`    ${colour}[${f.severity.toUpperCase()}]${OFF} ${f.code}`);
      console.log(`    ${DIM}${wrap(f.message, 72, '    ')}${OFF}\n`);
    }
  } else {
    console.log(`\n  ${GREEN}No flags raised.${OFF}`);
  }

  console.log(`  ${DIM}engine ${result.engineVersion} · comparables ${result.comparablesSnapshotId}${OFF}`);
}

function wrap(text: string, width: number, indent: string): string {
  const words = text.split(' ');
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    if ((line + w).length > width) {
      lines.push(line.trimEnd());
      line = '';
    }
    line += w + ' ';
  }
  if (line.trim()) lines.push(line.trimEnd());
  return lines.join('\n' + indent);
}

// ── The beta's inputs, exactly as displayed ──────────────────────────────────
report('CASE 1 — the beta’s own numbers (1BR at AED 2,000/sqft)', appraise(betaAppraisal()));

// ── The single field repriced inside the comparables band ────────────────────
report(
  'CASE 2 — 1BR repriced to AED 1,850/sqft, nothing else changed',
  appraise(betaAppraisal({ units: betaUnits(185_000n) })),
);

// ── Trace: how the blended figure was actually derived ───────────────────────
const traced = appraise(betaAppraisal({ units: betaUnits(185_000n) }));
console.log(`\n${BOLD}${'━'.repeat(78)}${OFF}`);
console.log(`${BOLD}DERIVATION — every number, and the rule that produced it${OFF}`);
console.log(`${BOLD}${'━'.repeat(78)}${OFF}\n`);
for (const step of traced.trace) {
  console.log(`  ${CYAN}${step.id}${OFF}  ${step.label}`);
  console.log(`    ${DIM}${step.rule}${OFF}`);
  const out =
    typeof step.output === 'number'
      ? step.id.includes('psf')
        ? psf(BigInt(step.output))
        : formatAed(BigInt(Math.round(step.output)))
      : JSON.stringify(step.output);
  console.log(`    → ${out}\n`);
}

console.log(
  `${DIM}Not modelled yet: finance, cashflow, the Dubai off-plan collection curve,\n` +
    `absorption, and uncertainty. All four need a DLD transaction store.${OFF}\n`,
);
