import React, { useMemo, useState } from 'react';
import { ClipboardList, Package, Plus, Search } from 'lucide-react';
import {
  CONTENT_UNITS,
  PRODUCT_STATUSES,
  UNITS_OF_MEASURE,
  type ContentUnit,
  type ProductStatus,
  type UnitOfMeasure,
} from '@skladnik/shared';
import { formatEuro } from '../../lib/dashboard-data';
import {
  useAddSupplierCode,
  useArchiveProduct,
  useCreateProduct,
  usePartnersQuery,
  useProductGroupsQuery,
  useProductsQuery,
  useRemoveSupplierCode,
  useStockQuery,
  useUpdateProduct,
} from '../../lib/workspace-session';
import { usePermissions } from '../../lib/permissions';
import { cn } from '../../lib/cn';
import { useDashboard } from './dashboard-context';
import { flattenProductGroups, type ProductRecord } from '../../lib/workspace-api';
import { FieldError, FieldLabel, textFieldClass } from '../PasswordField';
import { Select } from '../ui/Select';
import { toast } from '../ui/Toaster';
import { confirm } from '../ui/Dialog';
import { useTranslation } from 'react-i18next';
import {
  ActionButton,
  desktopTableWrapClass,
  GhostButton,
  GlassPanel,
  LiveBadge,
  MetricCard,
  MetricGrid,
  mobileCardClass,
  mobileCardListClass,
  PageHeader,
  tableHeadRowClass,
  tableRowClass,
} from './dashboard-ui';
import { RowActionsMenu } from './RowActionsMenu';
import { WorkspaceModal } from './WorkspaceModal';

type ProductForm = {
  name: string;
  code: string;
  groupId: string;
  unit: UnitOfMeasure;
  packSize: string;
  netContent: string;
  netContentUnit: '' | ContentUnit;
  vatRate: string;
  purchasePrice: string;
  sellingPrice: string;
  minStock: string;
  maxStock: string;
  batchTracking: 'yes' | 'no';
  status: ProductStatus;
  barcodes: string;
};

const emptyForm: ProductForm = {
  name: '',
  code: '',
  groupId: '',
  unit: 'PCS',
  packSize: '1',
  netContent: '',
  netContentUnit: '',
  vatRate: '20',
  purchasePrice: '0',
  sellingPrice: '0',
  minStock: '0',
  maxStock: '',
  batchTracking: 'no',
  status: 'ACTIVE',
  barcodes: '',
};

function parseBarcodes(value: string) {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export const InventoryPanel: React.FC = () => {
  const { t, i18n } = useTranslation();
  const permissions = usePermissions();
  const seeFinancials = permissions.seeFinancials;
  const { siteId } = useDashboard();
  const stockQuery = useStockQuery(siteId);
  const onHandById = useMemo(
    () => new Map((stockQuery.data?.items ?? []).map((item) => [item.productId, item])),
    [stockQuery.data],
  );
  const qtyFormat = useMemo(() => new Intl.NumberFormat(i18n.language, { maximumFractionDigits: 3 }), [i18n.language]);
  const canCatalog = permissions.productCatalog;
  const canMinStock = permissions.productMinStock;
  const canWrite = canCatalog || canMinStock;
  const groupsQuery = useProductGroupsQuery();
  const partnersQuery = usePartnersQuery();
  const [groupFilter, setGroupFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | ProductStatus>('ALL');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const productsQuery = useProductsQuery({
    groupId: groupFilter || undefined,
    status: statusFilter === 'ALL' ? undefined : statusFilter,
    q: debouncedSearch || undefined,
  });
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct();
  const archiveProduct = useArchiveProduct();
  const addSupplierCode = useAddSupplierCode();
  const removeSupplierCode = useRemoveSupplierCode();

  const [modal, setModal] = useState<'create' | ProductRecord | null>(null);
  const [form, setForm] = useState<ProductForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);
  const [supplierPartnerId, setSupplierPartnerId] = useState('');
  const [supplierCode, setSupplierCode] = useState('');
  const [supplierError, setSupplierError] = useState<string | null>(null);

  const products = productsQuery.data?.products ?? [];
  const groups = flattenProductGroups(groupsQuery.data?.groups ?? []);
  const suppliers = (partnersQuery.data?.partners ?? []).filter((partner) => partner.kind !== 'CUSTOMER');
  const editing = typeof modal === 'object' && modal !== null ? modal : null;
  const pendingCount = products.filter((product) => product.status === 'PENDING_REVIEW').length;
  const batchCount = products.filter((product) => product.batchTracking).length;

  React.useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const openCreate = () => {
    setForm(emptyForm);
    setError(null);
    setSupplierPartnerId('');
    setSupplierCode('');
    setSupplierError(null);
    setModal('create');
  };

  const openEdit = (product: ProductRecord) => {
    setForm({
      name: product.name,
      code: product.code,
      groupId: product.group?.id ?? '',
      unit: product.unit,
      packSize: String(product.packSize),
      netContent: product.netContent == null ? '' : String(product.netContent),
      netContentUnit: product.netContentUnit ?? '',
      vatRate: String(product.vatRate),
      purchasePrice: String(product.purchasePrice ?? 0),
      sellingPrice: String(product.sellingPrice),
      minStock: String(product.minStock),
      maxStock: product.maxStock === null ? '' : String(product.maxStock),
      batchTracking: product.batchTracking ? 'yes' : 'no',
      status: product.status,
      barcodes: product.barcodes.map((row) => row.barcode).join(', '),
    });
    setError(null);
    setSupplierPartnerId('');
    setSupplierCode('');
    setSupplierError(null);
    setModal(product);
  };

  const payloadFromForm = () => ({
    name: form.name.trim(),
    code: form.code.trim(),
    groupId: form.groupId || null,
    unit: form.unit,
    packSize: Number(form.packSize),
    netContent: form.netContent.trim() === '' ? null : Number(form.netContent),
    netContentUnit: form.netContentUnit === '' ? null : form.netContentUnit,
    vatRate: Number(form.vatRate),
    purchasePrice: Number(form.purchasePrice),
    sellingPrice: Number(form.sellingPrice),
    minStock: Number(form.minStock),
    maxStock: form.maxStock.trim() === '' ? null : Number(form.maxStock),
    batchTracking: form.batchTracking === 'yes',
    status: form.status,
    barcodes: parseBarcodes(form.barcodes),
  });

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      if (editing && !canCatalog) {
        await updateProduct.mutateAsync({ id: editing.id, minStock: Number(form.minStock) });
        toast.success(t('inventory.updated'));
        setModal(null);
        return;
      }
      const payload = payloadFromForm();
      if (editing) {
        await updateProduct.mutateAsync({ id: editing.id, ...payload });
        toast.success(t('inventory.updated'));
      } else {
        await createProduct.mutateAsync(payload);
        toast.success(t('inventory.added'));
      }
      setModal(null);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : t('inventory.saveFailed'));
    }
  };

  const handleAttachCode = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setSupplierError(null);
    try {
      await addSupplierCode.mutateAsync({
        productId: editing.id,
        partnerId: supplierPartnerId,
        supplierCode: supplierCode.trim(),
      });
      const next = await productsQuery.refetch();
      const updated = next.data?.products.find((product) => product.id === editing.id);
      if (updated) setModal(updated);
      setSupplierCode('');
      toast.success(t('inventory.codeAttached'));
    } catch (attachError) {
      setSupplierError(attachError instanceof Error ? attachError.message : t('inventory.attachFailed'));
    }
  };

  const title = useMemo(() => {
    if (editing && !canCatalog) return t('inventory.editMinStock');
    return editing ? t('inventory.editProduct') : t('inventory.addProduct');
  }, [editing, canCatalog, t]);
  const saving = createProduct.isPending || updateProduct.isPending;

  return (
    <div className="flex flex-col gap-5 sm:gap-6">
      <PageHeader
        title={t('pages.inventoryTitle')}
        description={t('pages.inventoryDesc')}
        action={canCatalog ? <ActionButton icon={Plus} label={t('inventory.addProduct')} onClick={openCreate} primary /> : undefined}
      />

      <MetricGrid columns={3}>
        <MetricCard label={t('inventory.catalog')} value={String(products.length)} hint={t('inventory.catalogHint')} icon={Package} />
        <MetricCard
          label={t('inventory.pendingReview')}
          value={String(pendingCount)}
          hint={t('inventory.pendingHint')}
          icon={ClipboardList}
          iconColor="text-ops-warn"
        />
        <MetricCard
          label={t('inventory.batchTracked')}
          value={String(batchCount)}
          hint={t('inventory.batchHint')}
          icon={Package}
          iconColor="text-ops-teal"
        />
      </MetricGrid>

      <GlassPanel
        padded={false}
        title={t('inventory.products')}
        action={<LiveBadge>{products.length} {products.length === 1 ? t('inventory.productOne') : t('inventory.productMany')}</LiveBadge>}
      >
        <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:px-5">
          <label className="relative min-w-0 flex-1">
            <Search size={14} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t('inventory.search')}
              className="w-full rounded-lg border border-slate-200 bg-ops-canvas py-2 pr-3 pl-9 font-sans text-[0.82rem] text-ops-ink outline-none focus:border-ops-teal/50 focus:bg-white"
            />
          </label>
          <div className="grid grid-cols-2 gap-2 sm:w-[22rem]">
            <Select
              value={groupFilter}
              onChange={setGroupFilter}
              options={[
                { value: '', label: t('inventory.allGroups') },
                ...groups.map((group) => ({ value: group.id, label: group.label })),
              ]}
            />
            <Select
              value={statusFilter}
              onChange={(value) => setStatusFilter(value as 'ALL' | ProductStatus)}
              options={[
                { value: 'ALL', label: t('inventory.activePending') },
                ...PRODUCT_STATUSES.map((status) => ({ value: status, label: t(`labels.productStatus.${status}`) })),
              ]}
            />
          </div>
        </div>

        {productsQuery.isPending ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">{t('inventory.loading')}</p>
        ) : products.length === 0 ? (
          <p className="px-5 py-8 font-sans text-sm text-slate-500">
            {t('inventory.emptyCatalog')}
          </p>
        ) : (
          <>
            <ul className={mobileCardListClass()}>
              {products.map((product) => {
                const level = onHandById.get(product.id);
                const onHandLabel = !level
                  ? !stockQuery.data
                    ? stockQuery.isLoading
                      ? '…'
                      : '—'
                    : '0'
                  : qtyFormat.format(level.onHand);
                const archive = async () => {
                  const ok = await confirm({
                    title: t('inventory.archiveNamed', { name: product.name }),
                    description: t('inventory.archiveBody'),
                    confirmLabel: t('common.archive'),
                    danger: true,
                  });
                  if (!ok) return;
                  try {
                    await archiveProduct.mutateAsync(product.id);
                    toast.success(t('inventory.archived'));
                  } catch (archiveError) {
                    toast.error(archiveError instanceof Error ? archiveError.message : t('common.couldNotArchive'));
                  }
                };
                return (
                  <li key={product.id} className={mobileCardClass()}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-display text-[0.86rem] font-medium text-ops-ink">{product.name}</p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {product.code}
                          {product.barcodes[0] ? ` · ${product.barcodes[0].barcode}` : ''}
                        </p>
                        <p className="mt-1 font-sans text-[0.74rem] text-slate-500">
                          <span
                            className={cn(
                              'font-mono tabular-nums',
                              level?.status === 'OUT'
                                ? 'text-ops-danger'
                                : level?.status === 'LOW'
                                  ? 'text-ops-warn'
                                  : 'text-ops-ink',
                            )}
                          >
                            {onHandLabel}
                          </span>
                          {' · '}
                          <span
                            className={
                              product.status === 'PENDING_REVIEW'
                                ? 'text-ops-warn'
                                : product.status === 'ARCHIVED'
                                  ? 'text-slate-400'
                                  : 'text-ops-teal'
                            }
                          >
                            {t(`labels.productStatus.${product.status}`)}
                          </span>
                        </p>
                      </div>
                      {canWrite && (
                        <RowActionsMenu
                          actions={[
                            {
                              label: canCatalog ? t('common.edit') : t('inventory.editMinStock'),
                              onClick: () => openEdit(product),
                            },
                            ...(canCatalog && product.status !== 'ARCHIVED'
                              ? [{ label: t('common.archive'), onClick: () => void archive(), danger: true }]
                              : []),
                          ]}
                        />
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className={desktopTableWrapClass()}>
              <table className="w-full min-w-[50rem] text-left">
                <thead>
                  <tr className={tableHeadRowClass()}>
                    <th className="px-5 py-3 font-display font-medium">{t('inventory.product')}</th>
                    <th className="px-4 py-3 text-right font-display font-medium whitespace-nowrap">{t('stock.onHand')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('inventory.group')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('inventory.unit')}</th>
                    <th className="px-4 py-3 font-display font-medium">{t('inventory.vat')}</th>
                    {seeFinancials ? (
                      <th className="px-4 py-3 font-display font-medium">{t('inventory.buySell')}</th>
                    ) : (
                      <th className="px-4 py-3 font-display font-medium">{t('inventory.sellingPrice')}</th>
                    )}
                    <th className="px-4 py-3 font-display font-medium">{t('inventory.status')}</th>
                    {canWrite && <th className="px-5 py-3 text-right font-display font-medium">{t('inventory.actions')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => (
                    <tr key={product.id} className={tableRowClass()}>
                      <td className="px-5 py-3.5">
                        <p className="font-display text-[0.86rem] font-medium text-ops-ink">{product.name}</p>
                        <p className="font-mono text-[0.66rem] text-slate-400">
                          {product.code}
                          {product.barcodes[0] ? ` · ${product.barcodes[0].barcode}` : ''}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-[0.82rem] tabular-nums">
                        {(() => {
                          const level = onHandById.get(product.id);
                          if (!level) return <span className="text-slate-400">{!stockQuery.data ? (stockQuery.isLoading ? '…' : '—') : '0'}</span>;
                          return (
                            <span
                              className={cn(
                                level.status === 'OUT' ? 'text-ops-danger' : level.status === 'LOW' ? 'text-ops-warn' : 'text-ops-ink',
                              )}
                            >
                              {qtyFormat.format(level.onHand)}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">{product.group?.name ?? '—'}</td>
                      <td className="px-4 py-3.5 font-sans text-[0.82rem] text-slate-600">
                        {t(`labels.unit.${product.unit}`)}
                        {product.packSize !== 1 ? ` · ${product.packSize}` : ''}
                      </td>
                      <td className="px-4 py-3.5 font-mono text-[0.78rem] text-slate-600">{product.vatRate}%</td>
                      <td className="px-4 py-3.5 font-mono text-[0.78rem] text-slate-600">
                        {seeFinancials
                          ? `${formatEuro(product.purchasePrice ?? 0)} / ${formatEuro(product.sellingPrice)}`
                          : formatEuro(product.sellingPrice)}
                      </td>
                      <td className="px-4 py-3.5">
                        <span
                          className={
                            product.status === 'PENDING_REVIEW'
                              ? 'font-display text-[0.72rem] text-ops-warn'
                              : product.status === 'ARCHIVED'
                                ? 'font-display text-[0.72rem] text-slate-400'
                                : 'font-display text-[0.72rem] text-ops-teal'
                          }
                        >
                          {t(`labels.productStatus.${product.status}`)}
                        </span>
                      </td>
                      {canWrite && (
                        <td className="px-5 py-3.5 text-right">
                          <div className="flex justify-end gap-1.5">
                            <GhostButton onClick={() => openEdit(product)}>
                              {canCatalog ? t('common.edit') : t('inventory.editMinStock')}
                            </GhostButton>
                            {canCatalog && product.status !== 'ARCHIVED' && (
                              <GhostButton
                                danger
                                onClick={async () => {
                                  const ok = await confirm({
                                    title: t('inventory.archiveNamed', { name: product.name }),
                                    description: t('inventory.archiveBody'),
                                    confirmLabel: t('common.archive'),
                                    danger: true,
                                  });
                                  if (!ok) return;
                                  try {
                                    await archiveProduct.mutateAsync(product.id);
                                    toast.success(t('inventory.archived'));
                                  } catch (archiveError) {
                                    toast.error(archiveError instanceof Error ? archiveError.message : t('common.couldNotArchive'));
                                  }
                                }}
                              >
                                {t('common.archive')}
                              </GhostButton>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </GlassPanel>

      <WorkspaceModal title={title} isOpen={modal !== null} onClose={() => setModal(null)} wide={canCatalog}>
        <form className="flex flex-col gap-4" onSubmit={handleSubmit}>
          {!canCatalog && editing ? (
            <>
              <p className="font-sans text-[0.82rem] text-slate-600">
                {editing.name}
                <span className="ml-2 font-mono text-[0.72rem] text-slate-400">{editing.code}</span>
              </p>
              <p className="font-sans text-[0.74rem] text-slate-500">{t('inventory.minStockManagerHint')}</p>
              <div>
                <FieldLabel htmlFor="product-min">{t('inventory.minStock')}</FieldLabel>
                <input
                  id="product-min"
                  required
                  type="number"
                  min="0"
                  step="0.001"
                  value={form.minStock}
                  onChange={(event) => setForm((prev) => ({ ...prev, minStock: event.target.value }))}
                  className={`${textFieldClass} pl-3`}
                />
              </div>
            </>
          ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="product-name">{t('inventory.name')}</FieldLabel>
              <input
                id="product-name"
                required
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-code">{t('inventory.internalCode')}</FieldLabel>
              <input
                id="product-code"
                required
                value={form.code}
                onChange={(event) => setForm((prev) => ({ ...prev, code: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-group">{t('inventory.group')}</FieldLabel>
              <Select
                id="product-group"
                value={form.groupId}
                onChange={(groupId) => setForm((prev) => ({ ...prev, groupId }))}
                options={[
                  { value: '', label: t('inventory.ungrouped') },
                  ...groups.map((group) => ({ value: group.id, label: group.label })),
                ]}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-unit">{t('inventory.unit')}</FieldLabel>
              <Select
                id="product-unit"
                value={form.unit}
                onChange={(unit) => setForm((prev) => ({ ...prev, unit }))}
                options={UNITS_OF_MEASURE.map((item) => ({ value: item, label: t(`labels.unit.${item}`) }))}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-pack">{t('inventory.packSize')}</FieldLabel>
              <input
                id="product-pack"
                required
                type="number"
                min="0.001"
                step="0.001"
                value={form.packSize}
                onChange={(event) => setForm((prev) => ({ ...prev, packSize: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-net-content">{t('inventory.netContent')}</FieldLabel>
              <div className="flex gap-2">
                <input
                  id="product-net-content"
                  type="number"
                  min="0.001"
                  step="0.001"
                  value={form.netContent}
                  onChange={(event) => setForm((prev) => ({ ...prev, netContent: event.target.value }))}
                  placeholder={t('inventory.netContentPlaceholder')}
                  className={`${textFieldClass} pl-3`}
                />
                <Select
                  id="product-net-unit"
                  value={form.netContentUnit}
                  onChange={(netContentUnit) =>
                    setForm((prev) => ({ ...prev, netContentUnit: netContentUnit as '' | ContentUnit }))
                  }
                  options={[
                    { value: '', label: '—' },
                    ...CONTENT_UNITS.map((unit) => ({ value: unit, label: t(`labels.unit.${unit}`) })),
                  ]}
                />
              </div>
              <p className="mt-1 font-sans text-[0.72rem] text-slate-500">{t('inventory.netContentHint')}</p>
            </div>
            <div>
              <FieldLabel htmlFor="product-vat">{t('inventory.vatPercent')}</FieldLabel>
              <input
                id="product-vat"
                required
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={form.vatRate}
                onChange={(event) => setForm((prev) => ({ ...prev, vatRate: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-buy">{t('inventory.purchasePrice')}</FieldLabel>
              <input
                id="product-buy"
                required
                type="number"
                min="0"
                step="0.0001"
                value={form.purchasePrice}
                onChange={(event) => setForm((prev) => ({ ...prev, purchasePrice: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-sell">{t('inventory.sellingPrice')}</FieldLabel>
              <input
                id="product-sell"
                required
                type="number"
                min="0"
                step="0.0001"
                value={form.sellingPrice}
                onChange={(event) => setForm((prev) => ({ ...prev, sellingPrice: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-min">{t('inventory.minStock')}</FieldLabel>
              <input
                id="product-min"
                required
                type="number"
                min="0"
                step="0.001"
                value={form.minStock}
                onChange={(event) => setForm((prev) => ({ ...prev, minStock: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-max">{t('inventory.maxStock')}</FieldLabel>
              <input
                id="product-max"
                type="number"
                min="0"
                step="0.001"
                value={form.maxStock}
                placeholder={t('inventory.maxStockPlaceholder')}
                onChange={(event) => setForm((prev) => ({ ...prev, maxStock: event.target.value }))}
                className={`${textFieldClass} pl-3`}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-batch">{t('inventory.batchTracking')}</FieldLabel>
              <Select
                id="product-batch"
                value={form.batchTracking}
                onChange={(batchTracking) => setForm((prev) => ({ ...prev, batchTracking }))}
                options={[
                  { value: 'no', label: t('common.off') },
                  { value: 'yes', label: t('inventory.batchOn') },
                ]}
              />
            </div>
            <div>
              <FieldLabel htmlFor="product-status">{t('inventory.status')}</FieldLabel>
              <Select
                id="product-status"
                value={form.status}
                onChange={(status) => setForm((prev) => ({ ...prev, status }))}
                options={PRODUCT_STATUSES.map((status) => ({ value: status, label: t(`labels.productStatus.${status}`) }))}
              />
            </div>
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="product-barcodes">{t('inventory.barcodes')}</FieldLabel>
              <input
                id="product-barcodes"
                value={form.barcodes}
                onChange={(event) => setForm((prev) => ({ ...prev, barcodes: event.target.value }))}
                className={`${textFieldClass} pl-3`}
                placeholder={t('inventory.barcodesHint')}
              />
            </div>
          </div>
          )}
          {error && <FieldError>{error}</FieldError>}
          <div className="flex justify-end gap-2 pt-1">
            <GhostButton onClick={() => setModal(null)}>{t('common.cancel')}</GhostButton>
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-ops-teal px-4 py-2 font-display text-[0.82rem] font-medium text-white hover:bg-ops-teal-hover disabled:opacity-60"
            >
              {saving ? t('common.saving') : editing ? t('common.saveChanges') : t('inventory.addProduct')}
            </button>
          </div>
        </form>

        {editing && canCatalog && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <h3 className="font-display text-[0.86rem] font-semibold text-ops-ink">{t('inventory.supplierCodes')}</h3>
            <p className="mt-1 font-sans text-[0.75rem] text-slate-500">
              {t('inventory.supplierCodesHint')}
            </p>
            <ul className="mt-3 flex flex-col gap-2">
              {editing.supplierCodes.length === 0 ? (
                <li className="font-sans text-[0.78rem] text-slate-400">{t('common.none')}</li>
              ) : (
                editing.supplierCodes.map((row) => (
                  <li key={row.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-ops-canvas px-3 py-2">
                    <span className="font-sans text-[0.8rem] text-ops-ink">
                      {row.partner.name}
                      <span className="ml-2 font-mono text-[0.75rem] text-slate-500">{row.supplierCode}</span>
                    </span>
                    <GhostButton
                      danger
                      onClick={async () => {
                        try {
                          await removeSupplierCode.mutateAsync({ productId: editing.id, mappingId: row.id });
                          setModal({
                            ...editing,
                            supplierCodes: editing.supplierCodes.filter((item) => item.id !== row.id),
                          });
                          toast.success(t('inventory.codeRemoved'));
                        } catch (removeError) {
                          toast.error(removeError instanceof Error ? removeError.message : t('common.couldNotRemove'));
                        }
                      }}
                    >
                      {t('common.remove')}
                    </GhostButton>
                  </li>
                ))
              )}
            </ul>
            <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_8rem_auto]" onSubmit={handleAttachCode}>
              <Select
                value={supplierPartnerId}
                onChange={setSupplierPartnerId}
                placeholder={t('inventory.supplier')}
                options={[
                  { value: '', label: t('inventory.supplier') },
                  ...suppliers.map((partner) => ({ value: partner.id, label: partner.name })),
                ]}
              />
              <input
                required
                value={supplierCode}
                onChange={(event) => setSupplierCode(event.target.value)}
                className={`${textFieldClass} pl-3`}
                placeholder={t('inventory.theirCode')}
              />
              <button
                type="submit"
                disabled={!supplierPartnerId || addSupplierCode.isPending}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 font-display text-[0.78rem] font-medium text-ops-ink hover:bg-ops-canvas disabled:opacity-60"
              >
                {t('inventory.attach')}
              </button>
            </form>
            {supplierError && <FieldError>{supplierError}</FieldError>}
          </div>
        )}
      </WorkspaceModal>
    </div>
  );
};
