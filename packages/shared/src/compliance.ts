import type { ReportLang } from './reports';

/**
 * Regulatory submissions (VAT return files, Annex 38 audit files) share one validation shape and one
 * archive. An `error` blocks generating the files; a `warning` is shown and stored with the filing.
 */
export type ComplianceSeverity = 'error' | 'warning' | 'info';

export type ComplianceIssueRef =
  | { kind: 'settings' }
  | { kind: 'document'; id: string; documentType?: string }
  | { kind: 'entry'; id: string }
  | { kind: 'return' }
  | { kind: 'period'; period: string }
  | { kind: 'company' }
  | { kind: 'eshop' };

export type ComplianceIssue = {
  severity: ComplianceSeverity;
  code: string;
  params?: Record<string, string | number>;
  ref?: ComplianceIssueRef;
};

export const COMPLIANCE_FILING_KINDS = ['VAT_RETURN', 'ANNEX38'] as const;
export type ComplianceFilingKind = (typeof COMPLIANCE_FILING_KINDS)[number];

export type ComplianceFilingFile = { name: string; key: string; size: number; sha256: string };

export type ComplianceFilingRecord = {
  id: string;
  kind: ComplianceFilingKind;
  period: string;
  /** '' for a company-wide filing, the site id for a per-site one (Annex 38). */
  scope: string;
  version: number;
  sourceHash: string;
  summary: Record<string, number | string>;
  issues: ComplianceIssue[];
  files: Omit<ComplianceFilingFile, 'key'>[];
  createdAt: string;
  createdByName: string | null;
  submittedAt: string | null;
  submissionRef: string | null;
  submittedByName: string | null;
};

/** `{{name}}` placeholders are filled from the issue's params. */
export function fillTemplate(template: string, params: Record<string, string | number> = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => (key in params ? String(params[key]) : match));
}

export function issueMessage(catalog: Record<string, Record<ReportLang, string>>, issue: ComplianceIssue, lang: ReportLang) {
  const template = catalog[issue.code]?.[lang] ?? issue.code;
  return fillTemplate(template, issue.params);
}

export function hasBlockingIssues(issues: ComplianceIssue[]) {
  return issues.some((issue) => issue.severity === 'error');
}
