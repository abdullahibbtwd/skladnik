import React from 'react';
import { useTranslation } from 'react-i18next';
import { normaliseEik, normaliseVatNumber, taxIdProblems, type TaxIdProblem } from '@skladnik/shared';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';

/** Problems with an ЕИК / VAT number pair as typed, checked the same way the server checks them on save. */
export function typedTaxIdProblems(eik: string, vatNumber: string): TaxIdProblem[] {
  return taxIdProblems({ eik: normaliseEik(eik) || null, vatNumber: normaliseVatNumber(vatNumber) || null });
}

export function useTaxIdProblemText() {
  const { t } = useTranslation();
  return (problem: TaxIdProblem) => t(`taxId.problem.${problem.code}`, { value: problem.value });
}

export const TaxIdFields: React.FC<{
  idPrefix: string;
  eik: string;
  vatNumber: string;
  onChange: (next: { eik: string; vatNumber: string }) => void;
  disabled?: boolean;
}> = ({ idPrefix, eik, vatNumber, onChange, disabled }) => {
  const { t } = useTranslation();
  const problemText = useTaxIdProblemText();
  const problems = typedTaxIdProblems(eik, vatNumber);
  const eikProblem = problems.find((problem) => problem.field === 'eik');
  const vatProblem = problems.find((problem) => problem.field === 'vatNumber');

  return (
    <>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-eik`}>{t('taxId.eik')}</FieldLabel>
        <input
          id={`${idPrefix}-eik`}
          value={eik}
          disabled={disabled}
          inputMode="numeric"
          autoComplete="off"
          aria-invalid={Boolean(eikProblem)}
          onChange={(event) => onChange({ eik: event.target.value, vatNumber })}
          className={`${textFieldClass} pl-3 font-mono`}
          placeholder="204512879"
        />
        {eikProblem ? <FieldError>{problemText(eikProblem)}</FieldError> : <p className="mt-1 font-sans text-[0.72rem] text-slate-400">{t('taxId.eikHint')}</p>}
      </div>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-vat`}>{t('taxId.vatNumber')}</FieldLabel>
        <input
          id={`${idPrefix}-vat`}
          value={vatNumber}
          disabled={disabled}
          autoComplete="off"
          aria-invalid={Boolean(vatProblem)}
          onChange={(event) => onChange({ eik, vatNumber: event.target.value })}
          className={`${textFieldClass} pl-3 font-mono`}
          placeholder="BG204512879"
        />
        {vatProblem ? (
          <FieldError>{problemText(vatProblem)}</FieldError>
        ) : (
          <p className="mt-1 font-sans text-[0.72rem] text-slate-400">{t('taxId.vatHint')}</p>
        )}
      </div>
    </>
  );
};
