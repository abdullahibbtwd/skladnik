import React from 'react';
import { Camera, Cpu, CheckCircle2 } from 'lucide-react';

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      number: '01',
      icon: <Camera size={24} strokeWidth={2.4} />,
      title: 'Snap or Upload Invoice',
      description:
        'Point any smartphone camera at delivery paperwork, vendor bills, or upload PDF files directly from your suppliers.'
    },
    {
      number: '02',
      icon: <Cpu size={24} strokeWidth={2.4} />,
      title: '20-Second AI Extraction',
      description:
        'Our computer vision model isolates SKU codes, line quantities, unit tax, and dates into structured digital data with 99%+ accuracy.'
    },
    {
      number: '03',
      icon: <CheckCircle2 size={24} strokeWidth={2.4} />,
      title: 'Live Stock & Annex 38 Ready',
      description:
        'Inventory updates automatically across all store counters. Expiry alarms turn on and tax-compliant XML audit logs are created instantly.'
    }
  ];

  return (
    <section id="how-it-works" className="how-it-works-section">
      <div className="container">
        <div className="section-header" style={{ marginBottom: '2.5rem' }}>
          <div
            className="section-badge"
            style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#C4B5FD' }}
          >
            <span>Workflow Simplicity</span>
          </div>
          <h2 className="section-title" style={{ color: '#FFFFFF' }}>
            From Paper Bill to Live Inventory in 3 Steps
          </h2>
          <p className="section-desc" style={{ color: '#94A3B8' }}>
            Built specifically to save retail store owners and café managers hours of manual inventory ledger entry every morning.
          </p>
        </div>

        <div className="steps-grid">
          {steps.map((step, idx) => (
            <div key={idx} className="step-card">
              <span className="step-number">{step.number}</span>
              <div className="step-icon-box">{step.icon}</div>
              <h3 className="step-title">{step.title}</h3>
              <p className="step-desc">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
