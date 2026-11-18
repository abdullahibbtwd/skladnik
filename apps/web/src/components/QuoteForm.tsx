import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Send } from 'lucide-react';
import { FieldError, FieldLabel, textFieldClass } from './PasswordField';
import { submitQuoteRequest } from '../lib/quote-api';
import { cn } from '../lib/cn';

const inputClass = textFieldClass.replace('pl-10', 'pl-[0.85rem]');

export const QuoteForm: React.FC = () => {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [locations, setLocations] = useState('1');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState('');
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const locs = Number.parseInt(locations, 10);
    if (!Number.isFinite(locs) || locs < 1) {
      setError(t('quote.errorGeneric'));
      return;
    }
    setPending(true);
    try {
      await submitQuoteRequest({
        name: name.trim(),
        businessType: businessType.trim(),
        locations: locs,
        contact: contact.trim(),
        message: message.trim() || undefined,
        locale: i18n.language?.startsWith('bg') ? 'bg' : 'en',
        website: website || undefined,
      });
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('quote.errorGeneric'));
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-ops-teal/20 bg-teal-50/60 px-5 py-8 text-center md:px-8">
        <CheckCircle2 className="mx-auto mb-3 text-ops-teal" size={28} />
        <h3 className="mb-2 font-display text-[1.15rem] font-semibold text-ops-ink">{t('quote.successTitle')}</h3>
        <p className="font-sans text-[0.92rem] text-slate-600">{t('quote.successBody')}</p>
      </div>
    );
  }

  return (
    <form onSubmit={(event) => void onSubmit(event)} className="flex flex-col gap-4">
      <div>
        <FieldLabel htmlFor="quote-name">{t('quote.name')}</FieldLabel>
        <input
          id="quote-name"
          required
          maxLength={120}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={inputClass}
          autoComplete="name"
        />
      </div>
      <div>
        <FieldLabel htmlFor="quote-business">{t('quote.businessType')}</FieldLabel>
        <input
          id="quote-business"
          required
          maxLength={120}
          value={businessType}
          onChange={(event) => setBusinessType(event.target.value)}
          placeholder={t('quote.businessTypePlaceholder')}
          className={inputClass}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="quote-locations">{t('quote.locations')}</FieldLabel>
          <input
            id="quote-locations"
            required
            type="number"
            min={1}
            max={9999}
            value={locations}
            onChange={(event) => setLocations(event.target.value)}
            className={inputClass}
          />
        </div>
        <div>
          <FieldLabel htmlFor="quote-contact">{t('quote.contact')}</FieldLabel>
          <input
            id="quote-contact"
            required
            maxLength={160}
            value={contact}
            onChange={(event) => setContact(event.target.value)}
            className={inputClass}
            autoComplete="email"
          />
        </div>
      </div>
      <div>
        <FieldLabel htmlFor="quote-message">{t('quote.message')}</FieldLabel>
        <textarea
          id="quote-message"
          maxLength={2000}
          rows={3}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className={cn(inputClass, 'min-h-[5.5rem] resize-y')}
        />
      </div>
      {/* Honeypot: visually hidden from humans */}
      <div className="absolute -left-[9999px] top-auto h-0 w-0 overflow-hidden" aria-hidden="true">
        <label htmlFor="quote-website">{t('quote.honeypotLabel')}</label>
        <input
          id="quote-website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>
      {error && <FieldError>{error}</FieldError>}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-ops-teal px-5 py-3 font-display text-[0.9rem] font-medium text-white shadow-[0_8px_18px_rgba(13,148,136,0.22)] transition-all hover:bg-ops-teal-hover disabled:opacity-60"
      >
        <Send size={16} />
        <span>{pending ? t('quote.submitting') : t('quote.submit')}</span>
      </button>
    </form>
  );
};
