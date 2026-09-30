import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCreatePartner } from '../../lib/workspace-session';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';
import { toast } from '../ui/Toaster';
import { TaxIdFields, typedTaxIdProblems, useTaxIdProblemText } from './TaxIdFields';

/**
 * One-click supplier create from an invoice/credit-note screen.
 * Site managers can use this even though they cannot open Settings → Partners.
 */
export function InlineCreateSupplier({
  onCreated,
  disabled,
}: {
  onCreated: (partnerId: string) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const createPartner = useCreatePartner();
  const problemText = useTaxIdProblemText();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [eik, setEik] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setName('');
    setEik('');
    setVatNumber('');
    setError(null);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError(t('doc.createSupplier.nameRequired'));
      return;
    }
    const problems = typedTaxIdProblems(eik, vatNumber);
    if (problems.length) {
      setError(problemText(problems[0]!));
      return;
    }
    setError(null);
    try {
      const result = await createPartner.mutateAsync({
        name: trimmed,
        kind: 'SUPPLIER',
        ...(eik.trim() ? { eik: eik.trim() } : {}),
        ...(vatNumber.trim() ? { vatNumber: vatNumber.trim() } : {}),
      });
      onCreated(result.partner.id);
      toast.success(t('doc.createSupplier.created', { name: result.partner.name }));
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('doc.createSupplier.failed'));
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className="mt-1.5 inline-flex items-center gap-1 font-display text-[0.74rem] font-medium text-ops-accent hover:underline disabled:opacity-50"
      >
        <Plus size={12} />
        {t('doc.createSupplier.open')}
      </button>
    );
  }

  return (
    <form onSubmit={save} className="mt-2 flex flex-col gap-2 rounded-xl border border-slate-200 bg-ops-canvas/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-[0.78rem] font-medium text-ops-ink">{t('doc.createSupplier.title')}</p>
        <button
          type="button"
          onClick={() => {
            reset();
            setOpen(false);
          }}
          className="rounded-md p-1 text-slate-400 hover:bg-white hover:text-ops-ink"
          aria-label={t('common.close')}
        >
          <X size={14} />
        </button>
      </div>
      <div>
        <FieldLabel htmlFor="inline-supplier-name">{t('doc.createSupplier.name')}</FieldLabel>
        <input
          id="inline-supplier-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={createPartner.isPending}
          className={`${textFieldClass} pl-3`}
          autoComplete="organization"
          required
        />
      </div>
      <TaxIdFields
        idPrefix="inline-supplier"
        eik={eik}
        vatNumber={vatNumber}
        disabled={createPartner.isPending}
        onChange={(next) => {
          setEik(next.eik);
          setVatNumber(next.vatNumber);
        }}
      />
      {error && <FieldError>{error}</FieldError>}
      <button
        type="submit"
        disabled={createPartner.isPending || !name.trim()}
        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-ops-ink shadow-sm hover:border-ops-accent/30 disabled:opacity-50"
      >
        {t('doc.createSupplier.save')}
      </button>
    </form>
  );
}
