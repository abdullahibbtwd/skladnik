import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { loginAsRole } from './lib/auth';
import { captureAnnotated, OUT_DIR, type DeviceName } from './lib/annotate';
import { setDevice } from './lib/nav';
import { stepsForTask, type GuideTask } from './lib/task-types';
import { OWNER_TASKS } from './owner-tasks';
import { SITE_MANAGER_TASKS } from './manager-tasks';
import { STAFF_TASKS } from './staff-tasks';
import { CASHIER_TASKS } from './cashier-tasks';
import { ACCOUNTANT_TASKS } from './accountant-tasks';
import { parseRole, type GuideRole } from './roles';

/**
 * Walks the tenant user guide for the selected role and saves annotated screenshots:
 *   {role}_{task}_{step}_{device}.png
 *
 * Env:
 *   GUIDE_ROLE=OWNER|SITE_MANAGER|STAFF|CASHIER|ACCOUNTANT
 *   GUIDE_ONLY_MISSING=1 — rerun only steps listed in output/_missing_{role}.json
 *   GUIDE_TASKS=mgrReceive,cashTill — optional task id filter
 *   GUIDE_BASE_URL / GUIDE_EMAIL / GUIDE_PASSWORD / GUIDE_OUT_DIR
 */
const role = parseRole(process.env.GUIDE_ROLE);
const taskFilter = (process.env.GUIDE_TASKS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const onlyMissing = process.env.GUIDE_ONLY_MISSING === '1' || process.env.GUIDE_ONLY_MISSING === 'true';

function tasksForRole(r: GuideRole): GuideTask[] {
  switch (r) {
    case 'OWNER':
      return OWNER_TASKS;
    case 'SITE_MANAGER':
      return SITE_MANAGER_TASKS;
    case 'STAFF':
      return STAFF_TASKS;
    case 'CASHIER':
      return CASHIER_TASKS;
    case 'ACCOUNTANT':
      return ACCOUNTANT_TASKS;
    default: {
      const _exhaustive: never = r;
      throw new Error(`Unhandled role: ${_exhaustive}`);
    }
  }
}

type MissingStep = { task: string; step: number; device: DeviceName };

function missingFilePath(r: GuideRole): string {
  return path.join(OUT_DIR, `_missing_${r.toLowerCase()}.json`);
}

/** Parse ids like site_manager_mgrPost_03_desktop → { task, step, device }. */
function parseMissingId(id: string, r: GuideRole): MissingStep | null {
  const device: DeviceName | null = id.endsWith('_desktop') ? 'desktop' : id.endsWith('_mobile') ? 'mobile' : null;
  if (!device) return null;
  const withoutDevice = id.slice(0, -(device.length + 1));
  const stepMatch = withoutDevice.match(/_(\d+)$/);
  if (!stepMatch || stepMatch.index === undefined) return null;
  const step = Number(stepMatch[1]);
  const prefix = `${r.toLowerCase()}_`;
  if (!withoutDevice.startsWith(prefix)) return null;
  const task = withoutDevice.slice(prefix.length, stepMatch.index);
  if (!task) return null;
  return { task, step, device };
}

function loadMissingSteps(r: GuideRole): MissingStep[] {
  const file = missingFilePath(r);
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { missingTargets?: string[] };
  return (raw.missingTargets ?? []).map((id) => parseMissingId(id, r)).filter((s): s is MissingStep => Boolean(s));
}

const devices: DeviceName[] = ['desktop', 'mobile'];

test.describe.configure({ mode: 'serial' });

test(`user guide screenshots — ${role}`, async ({ page }) => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await loginAsRole(page, role);

  const missingAllow = onlyMissing ? loadMissingSteps(role) : null;
  if (onlyMissing && missingAllow && missingAllow.length === 0) {
    test.info().annotations.push({ type: 'note', description: 'No missing steps to rerun' });
    console.log(`GUIDE_ONLY_MISSING: nothing listed in ${missingFilePath(role)}`);
    return;
  }

  let tasks = tasksForRole(role).filter((t) => !taskFilter.length || taskFilter.includes(t.id));
  if (missingAllow) {
    const taskIds = new Set(missingAllow.map((m) => m.task));
    tasks = tasks.filter((t) => taskIds.has(t.id));
  }
  expect(tasks.length, 'No tasks selected').toBeGreaterThan(0);

  const saved: string[] = [];
  const missingTargets: string[] = [];

  for (const task of tasks) {
    for (const device of devices) {
      await setDevice(page, device);
      let steps = stepsForTask(task, device);
      if (missingAllow) {
        const wanted = new Set(
          missingAllow.filter((m) => m.task === task.id && m.device === device).map((m) => m.step),
        );
        steps = steps.filter((s) => wanted.has(s.step));
        if (!steps.length) continue;
      }
      expect(steps.length, `${task.id} has no steps for ${device}`).toBeGreaterThan(0);

      for (const step of steps) {
        const id = `${role.toLowerCase()}_${task.id}_${String(step.step).padStart(2, '0')}_${device}`;
        await test.step(`${task.id} · step ${step.step} · ${device}`, async () => {
          try {
            await step.prepare(page, device);
            const target = step.target(page, device).first();
            // Never screenshot a fallback — only capture when the real guide element is visible.
            await expect(target, `${task.id} step ${step.step} target`).toBeVisible({ timeout: 30_000 });
            const file = await captureAnnotated(page, target, {
              role,
              task: task.id,
              step: step.step,
              device,
            });
            saved.push(file);
          } catch (err) {
            missingTargets.push(id);
            console.warn(`MISSING ${id}: ${err instanceof Error ? err.message : String(err)}`);
            if (!onlyMissing) throw err;
          }
        });
      }
    }
  }

  // When only re-running missing steps, merge with previous missing list: drop fixed ones.
  let remainingMissing = missingTargets;
  if (onlyMissing && missingAllow) {
    const fixed = new Set(saved.map((f) => path.basename(f, '.png')));
    const previous = loadMissingSteps(role).map(
      (m) => `${role.toLowerCase()}_${m.task}_${String(m.step).padStart(2, '0')}_${m.device}`,
    );
    remainingMissing = previous.filter((id) => !fixed.has(id));
  }

  console.log(`Saved ${saved.length} screenshots → ${OUT_DIR}`);
  for (const file of saved) console.log(`  ${file}`);

  if (remainingMissing.length) {
    console.log(`\nMISSING TARGETS (${remainingMissing.length}):`);
    for (const id of remainingMissing) console.log(`  ${id}`);
  } else {
    console.log('\nMISSING TARGETS: none');
  }

  fs.writeFileSync(
    missingFilePath(role),
    JSON.stringify({ role, missingTargets: remainingMissing, savedCount: saved.length }, null, 2),
  );
});
