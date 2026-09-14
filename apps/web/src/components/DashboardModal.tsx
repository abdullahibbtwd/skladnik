import React, { useState } from 'react';
import {
  X,
  Boxes,
  ShieldCheck,
  CheckCircle2,
  Download,
  Camera,
  AlertTriangle,
  Clock,
  LogOut,
  Store,
  Layers,
  FileCheck2
} from 'lucide-react';
import { SampleInvoice } from './HeroSection';

interface DashboardModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: { name: string; email: string; storeName: string };
  committedInvoices: SampleInvoice[];
  onOpenScanDemo: () => void;
  onLogout: () => void;
}

export const DashboardModal: React.FC<DashboardModalProps> = ({
  isOpen,
  onClose,
  user,
  committedInvoices,
  onOpenScanDemo,
  onLogout
}) => {
  const [downloadedXml, setDownloadedXml] = useState(false);

  if (!isOpen) return null;

  // Flatten all items across committed invoices
  const allItems = committedInvoices.flatMap((inv) =>
    inv.items.map((item) => ({
      ...item,
      supplier: inv.supplier,
      invNumber: inv.invNumber,
      date: inv.date
    }))
  );

  const totalSKUs = allItems.length;
  const totalUnits = allItems.reduce((acc, item) => acc + item.qty, 0);
  const urgentCount = allItems.filter((i) => i.fefoStatus === 'urgent').length;

  const handleDownloadXml = () => {
    const xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<Annex38AuditLog schemaVersion="2026.1" xmlns="urn:skladnik:annex38">
  <Header>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
    <Application>Skladnik Retail POS Suite v2.4</Application>
    <StoreName>${user.storeName}</StoreName>
    <OwnerEmail>${user.email}</OwnerEmail>
    <Status>AUDIT_COMPLIANT</Status>
  </Header>
  <InventorySnapshot totalLines="${allItems.length}" totalUnits="${totalUnits}">
${allItems
  .map(
    (item) => `    <StockItem sku="${item.sku}" name="${item.description}" qty="${item.qty}" unitPrice="${item.unitPrice}" fefo="${item.fefoLabel}" supplier="${item.supplier}" invoice="${item.invNumber}" />`
  )
  .join('\n')}
  </InventorySnapshot>
</Annex38AuditLog>`;

    const blob = new Blob([xmlContent], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annex38_${user.storeName.toLowerCase().replace(/\s+/g, '_')}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloadedXml(true);
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-dialog dashboard-modal-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '900px', width: '95%' }}
      >
        {/* Header */}
        <div className="modal-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div className="logo-icon-box" style={{ width: '2.25rem', height: '2.25rem', borderRadius: '0.55rem' }}>
              <Boxes size={18} strokeWidth={2.4} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 800, fontSize: '1.15rem', color: '#FFFFFF' }}>
                  {user.storeName}
                </span>
                <span
                  style={{
                    background: 'rgba(16, 185, 129, 0.12)',
                    color: '#34D399',
                    border: '1px solid rgba(16, 185, 129, 0.25)',
                    fontSize: '0.68rem',
                    fontWeight: 700,
                    padding: '2px 7px',
                    borderRadius: '9999px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.25rem'
                  }}
                >
                  <CheckCircle2 size={11} />
                  <span>Live Store Active</span>
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                {user.email} &bull; Retail Free Plan (€0/mo)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
            <button
              onClick={() => {
                onClose();
                onOpenScanDemo();
              }}
              className="btn-primary"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.85rem' }}
            >
              <Camera size={14} />
              <span>Scan New Invoice</span>
            </button>
            <button
              onClick={onLogout}
              className="btn-ghost-dark"
              style={{ fontSize: '0.8rem', padding: '0.45rem 0.75rem', display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
              title="Log out"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
            <button onClick={onClose} className="modal-close-btn" aria-label="Close dashboard">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ padding: '1.5rem' }}>
          {/* Imported Success Banner */}
          <div
            style={{
              background: 'rgba(16, 185, 129, 0.08)',
              border: '1px solid rgba(16, 185, 129, 0.25)',
              borderRadius: '0.65rem',
              padding: '0.85rem 1.15rem',
              marginBottom: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.5rem'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem' }}>
              <ShieldCheck size={18} color="#10B981" />
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#34D399' }}>
                  Demo Invoices Successfully Preserved into Store Ledger
                </div>
                <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>
                  All items catalog-matched, FEFO tracked, and audit XML generated.
                </div>
              </div>
            </div>

            <button
              onClick={handleDownloadXml}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.35rem',
                background: downloadedXml ? '#059669' : 'rgba(16, 185, 129, 0.15)',
                color: '#FFFFFF',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '0.4rem 0.8rem',
                borderRadius: '0.4rem',
                fontSize: '0.75rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <Download size={13} />
              <span>{downloadedXml ? 'Annex 38 XML Exported' : 'Export Annex 38 XML'}</span>
            </button>
          </div>

          {/* Metrics Row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '1rem',
              marginBottom: '1.5rem'
            }}
          >
            <div
              style={{
                background: '#0D1322',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1rem',
                borderRadius: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                <Layers size={14} color="#38BDF8" />
                <span>Live Catalog Lines</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#FFFFFF', fontFamily: 'var(--font-mono)' }}>
                {totalSKUs} <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>SKUs</span>
              </div>
            </div>

            <div
              style={{
                background: '#0D1322',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1rem',
                borderRadius: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                <Store size={14} color="#10B981" />
                <span>Total Units In Stock</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: '#34D399', fontFamily: 'var(--font-mono)' }}>
                {totalUnits} <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>units</span>
              </div>
            </div>

            <div
              style={{
                background: '#0D1322',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1rem',
                borderRadius: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                <AlertTriangle size={14} color="#FBBF24" />
                <span>FEFO Expiry Notice</span>
              </div>
              <div style={{ fontSize: '1.4rem', fontWeight: 800, color: urgentCount > 0 ? '#F87171' : '#34D399', fontFamily: 'var(--font-mono)' }}>
                {urgentCount} <span style={{ fontSize: '0.8rem', color: '#64748B', fontWeight: 500 }}>critical (&lt; 5d)</span>
              </div>
            </div>

            <div
              style={{
                background: '#0D1322',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                padding: '1rem',
                borderRadius: '0.65rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#94A3B8', fontSize: '0.75rem', marginBottom: '0.35rem' }}>
                <FileCheck2 size={14} color="#A78BFA" />
                <span>Annex 38 Tax Status</span>
              </div>
              <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#38BDF8', marginTop: '0.3rem' }}>
                100% Tax Compliant
              </div>
            </div>
          </div>

          {/* Live Inventory Table */}
          <div
            style={{
              background: '#0D1322',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '0.65rem',
              overflow: 'hidden'
            }}
          >
            <div
              style={{
                padding: '0.75rem 1rem',
                background: 'rgba(255, 255, 255, 0.03)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#FFFFFF' }}>
                Active Stock Ledger ({allItems.length} Line Items)
              </span>
              <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                Reconciled from Paper Invoices
              </span>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '600px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', background: 'rgba(255, 255, 255, 0.01)' }}>
                    <th style={{ padding: '0.65rem 1rem', fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Item &amp; Catalog SKU</th>
                    <th style={{ padding: '0.65rem 1rem', fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600 }}>Supplier &amp; Invoice</th>
                    <th style={{ padding: '0.65rem 1rem', fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, textAlign: 'center' }}>Live Stock</th>
                    <th style={{ padding: '0.65rem 1rem', fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, textAlign: 'center' }}>FEFO Status</th>
                    <th style={{ padding: '0.65rem 1rem', fontSize: '0.68rem', color: '#94A3B8', textTransform: 'uppercase', fontWeight: 600, textAlign: 'right' }}>Unit Price</th>
                  </tr>
                </thead>
                <tbody>
                  {allItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                      <td style={{ padding: '0.7rem 1rem' }}>
                        <div style={{ fontWeight: 600, fontSize: '0.8rem', color: '#FFFFFF' }}>{item.description}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B', fontFamily: 'var(--font-mono)' }}>{item.sku}</div>
                      </td>
                      <td style={{ padding: '0.7rem 1rem' }}>
                        <div style={{ fontSize: '0.76rem', color: '#CBD5E1' }}>{item.supplier}</div>
                        <div style={{ fontSize: '0.68rem', color: '#64748B' }}>{item.invNumber} ({item.date})</div>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#38BDF8', fontSize: '0.82rem' }}>
                          {item.qty} units
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', textAlign: 'center' }}>
                        <span
                          className={`fefo-pill ${
                            item.fefoStatus === 'urgent'
                              ? 'fefo-pill-urgent'
                              : item.fefoStatus === 'warning'
                              ? 'fefo-pill-warning'
                              : 'fefo-pill-safe'
                          }`}
                        >
                          {item.fefoStatus === 'urgent' ? <AlertTriangle size={11} /> : <Clock size={11} />}
                          <span>{item.fefoLabel}</span>
                        </span>
                      </td>
                      <td style={{ padding: '0.7rem 1rem', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#F1F5F9' }}>
                        {item.unitPrice}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
