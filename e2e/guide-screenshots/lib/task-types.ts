import type { Locator, Page } from '@playwright/test';
import type { DeviceName } from './annotate';

export type GuideStep = {
  /** 1-based step number used in the filename and badge. */
  step: number;
  /** Navigate / open UI so the target is visible. */
  prepare: (page: Page, device: DeviceName) => Promise<void>;
  /** Element the guide step refers to. */
  target: (page: Page, device: DeviceName) => Locator;
};

export type GuideTask = {
  id: string;
  /** Shared steps (used when desktop/mobile are not set). */
  steps?: GuideStep[];
  /** Device-specific steps for splitNav tasks. */
  desktop?: GuideStep[];
  mobile?: GuideStep[];
};

export function stepsForTask(task: GuideTask, device: DeviceName): GuideStep[] {
  if (device === 'desktop' && task.desktop) return task.desktop;
  if (device === 'mobile' && task.mobile) return task.mobile;
  return task.steps ?? [];
}
