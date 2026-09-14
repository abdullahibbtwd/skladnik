import React from 'react';
import { Check, ShieldCheck, ArrowRight } from 'lucide-react';

interface PricingSectionProps {
  onOpenDemo: () => void;
}

export const PricingSection: React.FC<PricingSectionProps> = ({ onOpenDemo }) => {
  const plans = [
    {
      name: 'Starter Shop',
      subtitle: 'For independent corner stores and neighbourhood kiosks.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: false,
      placeholderSummary: 'Early access tier for local independent shops.',
      features: [
        'Core OCR receipt scanning',
        'Basic stock management',
        'Feature details coming soon'
      ],
      ctaText: 'Start Free Trial',
      isPrimary: false
    },
    {
      name: 'Pro Store',
      subtitle: 'For busy grocery stores, bakeries, and cafes.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: true,
      placeholderSummary: 'Full platform access during our launch preview.',
      features: [
        '20-second fast AI document engine',
        'FEFO expiry tracking & waste alerts',
        'Annex No. 38 XML compliance ready'
      ],
      ctaText: 'Start Free Trial',
      isPrimary: true
    },
    {
      name: 'Multi-Location',
      subtitle: 'For expanding retail chains, franchises, and multi-branch outlets.',
      price: '0',
      currency: '€',
      period: '/ month',
      featured: false,
      placeholderSummary: 'Enterprise onboarding and centralized audit control.',
      features: [
        'Multi-branch stock sync',
        'Custom register & POS setup',
        'Priority technical assistance'
      ],
      ctaText: 'Contact Sales',
      isPrimary: false
    }
  ];

  return (
    <section id="pricing" className="pricing-section">
      <div className="container">
        <div className="section-header">
          <div className="section-badge">
            <ShieldCheck size={14} />
            <span>Store Plans</span>
          </div>
          <h2 className="section-title">Accessible for Every Retailer</h2>
          <p className="section-desc">
            Get started immediately with full access during our preview release.
          </p>
        </div>

        <div className="pricing-grid">
          {plans.map((plan, idx) => (
            <div
              key={idx}
              className={`pricing-card ${plan.featured ? 'featured' : ''}`}
            >
              {plan.featured && (
                <div className="pricing-badge-popular">Recommended</div>
              )}

              <div>
                <h3 className="plan-title">{plan.name}</h3>
                <p className="plan-subtitle">{plan.subtitle}</p>

                {/* Price set to 0 */}
                <div className="plan-price-box">
                  <span className="plan-currency">{plan.currency}</span>
                  <span className="plan-price">{plan.price}</span>
                  <span className="plan-period">{plan.period}</span>
                </div>

                <div className="plan-preview-note">
                  {plan.placeholderSummary}
                </div>

                {/* Simplified concise items */}
                <ul className="plan-feature-list">
                  {plan.features.map((feature, fIdx) => (
                    <li key={fIdx} className="plan-feature-item">
                      <div className="plan-check-box">
                        <Check size={13} strokeWidth={2.8} />
                      </div>
                      <span>{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Styled Action Buttons */}
              <button
                onClick={onOpenDemo}
                className={plan.isPrimary ? 'btn-pricing-primary' : 'btn-pricing-secondary'}
              >
                <span>{plan.ctaText}</span>
                <ArrowRight size={16} className="btn-arrow-icon" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
