import { useEffect, useMemo } from 'react';
import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { useAuthUser } from './auth-store';
import { readOfflineSites, saveOfflineSites, type OfflineSite } from './offline-session';
import {
  fetchActivity,
  fetchCompanySettings,
  saveCompanyProfile,
  saveDocumentSeries,
  saveExpiryWindows,
  savePriceOverrideRoles,
  savePrintTemplate,
  type ActivityFilters,
  createExportProfile,
  deleteExportProfile,
  fetchArchivePreview,
  fetchExportProfiles,
  fetchReport,
  updateExportProfile,
  type ExportProfileInput,
  type ReportParams,
  deleteVatEntry,
  fetchAnnex38Archive,
  fetchAnnex38Period,
  fetchAnnex38Sites,
  generateAnnex38,
  markAnnex38Submitted,
  saveEShopSettings,
  fetchVatPeriod,
  fetchVatSettings,
  generateVatFiling,
  markVatFilingSubmitted,
  saveVatEntry,
  saveVatReturnInputs,
  saveVatSettings,
  setVatDocumentTreatment,
  addDocumentLine,
  addSupplierCode,
  archiveProduct,
  enableProductBatchTracking,
  mergePendingProduct,
  cancelDocument,
  reverseDocument,
  createDocument,
  createInvite,
  createPartner,
  createProduct,
  createProductFromLine,
  createProductGroup,
  createSite,
  createUnitAlias,
  deactivateSite,
  deactivateUser,
  deleteDocumentLine,
  deletePartner,
  deleteProductGroup,
  deleteUnitAlias,
  fetchDocument,
  fetchDocuments,
  fetchInvitePreview,
  fetchInvites,
  fetchMovements,
  fetchPartners,
  fetchPartnerLookup,
  fetchProductGroups,
  fetchProducts,
  fetchReorder,
  fetchSale,
  fetchSales,
  fetchSalesReport,
  fetchMargins,
  createSale,
  voidSale,
  fetchRecipes,
  fetchRecipe,
  fetchMenu,
  saveRecipe,
  deleteRecipe,
  type RecipeWriteInput,
  fetchSites,
  fetchStock,
  fetchTransferTargets,
  fetchUnitAliases,
  fetchUsers,
  postDocument,
  removeSupplierCode,
  resendInvite,
  retryDocumentExtraction,
  revokeInvite,
  setStocktakeCounts,
  submitDocument,
  updateDocument,
  updateDocumentLine,
  updatePartner,
  updateProduct,
  updateProductGroup,
  updateSite,
  updateUnitAlias,
  updateUser,
  uploadDocumentCapture,
  workspaceKeys,
  type CreateProductFromLineInput,
  type DocumentLineWriteInput,
  type DocumentUpdateInput,
  type DocumentWriteInput,
  type PostDocumentOptions,
  type ReverseDocumentInput,
  type ProductWriteInput,
  type SaleInput,
} from './workspace-api';
import { DEFAULT_EXPIRY_WINDOWS } from '@skladnik/shared';
import type {
  CompanyProfile,
  EShopSettings,
  DocumentSeriesKey,
  PrintTemplate,
  DocumentStatus,
  DocumentType,
  PartnerKind,
  ProductStatus,
  ReportKind,
  SiteType,
  UnitOfMeasure,
  UserRole,
  VatCredit,
  VatEntryInput,
  VatReturnInputs,
  VatSettingsInput,
} from '@skladnik/shared';

const VAT_ROOT = ['workspace', 'vat'] as const;
const ANNEX38_ROOT = ['workspace', 'annex38'] as const;

/** Company profile and rules; every role reads them (expiry colours, till price rights, print header). */
export function useCompanySettingsQuery(enabled = true) {
  return useQuery({ queryKey: workspaceKeys.company, queryFn: fetchCompanySettings, enabled, staleTime: 5 * 60_000 });
}

/** The company's VAT number feeds the VAT module and every change is logged, so those caches refresh too. */
function useCompanyMutation<TInput>(mutationFn: (input: TInput) => ReturnType<typeof fetchCompanySettings>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: (settings) => {
      queryClient.setQueryData(workspaceKeys.company, settings);
      void queryClient.invalidateQueries({ queryKey: VAT_ROOT });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'activity'] });
    },
  });
}

/** The company's expiry thresholds; the defaults until settings load (or when offline without a copy). */
export function useExpiryWindows(): readonly number[] {
  return useCompanySettingsQuery().data?.expiryWindows ?? DEFAULT_EXPIRY_WINDOWS;
}

export function useSaveCompanyProfile() {
  return useCompanyMutation((input: CompanyProfile) => saveCompanyProfile(input));
}

export function useSaveExpiryWindows() {
  return useCompanyMutation((windows: number[]) => saveExpiryWindows(windows));
}

export function useSavePrintTemplate() {
  return useCompanyMutation((input: PrintTemplate) => savePrintTemplate(input));
}

export function useSavePriceOverrideRoles() {
  return useCompanyMutation((roles: UserRole[]) => savePriceOverrideRoles(roles));
}

export function useSaveDocumentSeries() {
  return useCompanyMutation(
    ({
      key,
      ...input
    }: {
      key: DocumentSeriesKey;
      prefix: string;
      padding: number;
      nextNumber: number;
      resetYearly: boolean;
    }) => saveDocumentSeries(key, input),
  );
}

export function useActivityQuery(filters: ActivityFilters) {
  return useInfiniteQuery({
    queryKey: workspaceKeys.activity(filters),
    queryFn: ({ pageParam }) => fetchActivity(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.nextCursor,
    placeholderData: keepPreviousData,
  });
}

export function useVatSettingsQuery(enabled = true) {
  return useQuery({ queryKey: workspaceKeys.vatSettings, queryFn: fetchVatSettings, enabled });
}

export function useVatPeriodQuery(period: string, enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.vatPeriod(period),
    queryFn: ({ signal }) => fetchVatPeriod(period, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** Every VAT change can move totals, issues and drift, so the whole VAT cache is refreshed. */
function useVatMutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSuccess: () => queryClient.invalidateQueries({ queryKey: VAT_ROOT }) });
}

export function useSaveVatSettings() {
  return useVatMutation((input: VatSettingsInput) => saveVatSettings(input));
}

export function useSaveVatReturnInputs() {
  return useVatMutation(({ period, ...input }: VatReturnInputs & { period: string }) => saveVatReturnInputs(period, input));
}

export function useSetVatDocumentTreatment() {
  return useVatMutation(({ id, ...input }: { id: string; vatCredit?: VatCredit | null; vatPeriod?: string | null }) => setVatDocumentTreatment(id, input));
}

export function useSaveVatEntry() {
  return useVatMutation(({ id, ...input }: VatEntryInput & { id: string | null }) => saveVatEntry(id, input));
}

export function useDeleteVatEntry() {
  return useVatMutation((id: string) => deleteVatEntry(id));
}

export function useGenerateVatFiling() {
  return useVatMutation((period: string) => generateVatFiling(period));
}

export function useMarkVatFilingSubmitted() {
  return useVatMutation(({ id, ...input }: { id: string; submissionRef: string; submittedAt?: string }) => markVatFilingSubmitted(id, input));
}

export function useAnnex38SitesQuery(enabled = true) {
  return useQuery({ queryKey: [...ANNEX38_ROOT, 'sites'], queryFn: fetchAnnex38Sites, enabled });
}

export function useAnnex38PeriodQuery(siteId: string | null, period: string, enabled = true) {
  return useQuery({
    queryKey: [...ANNEX38_ROOT, 'period', siteId, period],
    queryFn: () => fetchAnnex38Period(siteId!, period),
    enabled: enabled && Boolean(siteId),
    placeholderData: keepPreviousData,
  });
}

export function useAnnex38ArchiveQuery(enabled = true) {
  return useQuery({ queryKey: [...ANNEX38_ROOT, 'archive'], queryFn: fetchAnnex38Archive, enabled });
}

/** Settings change the file and the till's reference field (sites list), filings change the archive. */
function useAnnex38Mutation<TInput, TResult>(mutationFn: (input: TInput) => Promise<TResult>, alsoSites = false) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ANNEX38_ROOT });
      void queryClient.invalidateQueries({ queryKey: ['workspace', 'activity'] });
      if (alsoSites) void queryClient.invalidateQueries({ queryKey: workspaceKeys.sites });
    },
  });
}

export function useSaveEShopSettings() {
  return useAnnex38Mutation(({ siteId, ...input }: EShopSettings & { siteId: string }) => saveEShopSettings(siteId, input), true);
}

export function useGenerateAnnex38() {
  return useAnnex38Mutation(({ siteId, period }: { siteId: string; period: string }) => generateAnnex38(siteId, period));
}

export function useMarkAnnex38Submitted() {
  return useAnnex38Mutation(({ id, ...input }: { id: string; submissionRef: string; submittedAt?: string }) => markAnnex38Submitted(id, input));
}

/** Keeps the last table on screen while a changed filter loads. Cancels in-flight work on route/param change. */
export function useReportQuery(kind: ReportKind, params: ReportParams, enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.report(kind, params),
    queryFn: ({ signal }) => fetchReport(kind, params, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useArchivePreviewQuery(params: ReportParams, enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.archivePreview(params),
    queryFn: ({ signal }) => fetchArchivePreview(params, { signal }),
    enabled,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useExportProfilesQuery(enabled = true) {
  return useQuery({ queryKey: workspaceKeys.exportProfiles, queryFn: () => fetchExportProfiles(), enabled });
}

export function useSaveExportProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: ExportProfileInput & { id?: string }) => (id ? updateExportProfile(id, input) : createExportProfile(input)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.exportProfiles }),
  });
}

export function useDeleteExportProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteExportProfile,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.exportProfiles }),
  });
}

/** First load may come from the offline copy; a refetch of data already on screen (change, focus, reconnect) goes to the server. */
const hasData = (queryClient: QueryClient, queryKey: QueryKey) => queryClient.getQueryData(queryKey) !== undefined;

export function useSitesQuery() {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: workspaceKeys.sites,
    queryFn: () => fetchSites({ fresh: hasData(queryClient, workspaceKeys.sites) }),
  });
}

/** Active sites for the site picker; falls back to the last known list while the API is unreachable. */
export function useSiteChoices() {
  const user = useAuthUser();
  const query = useSitesQuery();
  const live = query.data?.sites;
  const sites = useMemo<OfflineSite[]>(
    () => (live ? live.filter((site) => site.isActive) : readOfflineSites(user)),
    [live, user],
  );
  useEffect(() => {
    if (live && user) saveOfflineSites(user.id, live.filter((site) => site.isActive));
  }, [live, user]);
  return { sites, isPending: query.isPending && sites.length === 0 };
}

export function useTransferTargetsQuery() {
  return useQuery({
    queryKey: workspaceKeys.transferTargets,
    queryFn: fetchTransferTargets,
  });
}

export function useUsersQuery(enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.users,
    queryFn: fetchUsers,
    enabled,
  });
}

export function useInvitesQuery(enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.invites,
    queryFn: fetchInvites,
    enabled,
  });
}

export function useInvitePreviewQuery(token: string | null) {
  return useQuery({
    queryKey: workspaceKeys.invite(token ?? ''),
    queryFn: () => fetchInvitePreview(token!),
    enabled: Boolean(token),
    retry: false,
  });
}

export function useCreateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; type: SiteType; address?: string; managerUserId?: string }) => createSite(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.sites }),
  });
}

export function useUpdateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      type?: SiteType;
      address?: string;
      managerUserId?: string | null;
      isActive?: boolean;
    }) => updateSite(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.sites }),
  });
}

export function useDeactivateSite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateSite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.sites }),
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; role?: UserRole; siteIds?: string[]; isActive?: boolean }) =>
      updateUser(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.users }),
  });
}

export function useDeactivateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deactivateUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.users }),
  });
}

export function useCreateInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; role: UserRole; siteIds?: string[] }) => createInvite(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.invites }),
  });
}

export function useResendInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: resendInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.invites }),
  });
}

export function useRevokeInvite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: revokeInvite,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.invites }),
  });
}

function invalidateCatalog(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
  void queryClient.invalidateQueries({ queryKey: workspaceKeys.productGroups });
  void queryClient.invalidateQueries({ queryKey: ['workspace', 'recipes'] });
}

export function useProductGroupsQuery() {
  return useQuery({
    queryKey: workspaceKeys.productGroups,
    queryFn: fetchProductGroups,
  });
}

export function useCreateProductGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string; parentId?: string }) => createProductGroup(input),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateProductGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; parentId?: string | null }) =>
      updateProductGroup(id, input),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useDeleteProductGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteProductGroup,
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function usePartnersQuery() {
  return useQuery({
    queryKey: workspaceKeys.partners,
    queryFn: () => fetchPartners(),
  });
}

export function usePartnerLookupQuery(filters?: { kind?: PartnerKind; q?: string }) {
  return useQuery({
    queryKey: workspaceKeys.partnerLookup(filters),
    queryFn: () => fetchPartnerLookup(filters?.kind, filters?.q),
  });
}

export function useCreatePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPartner,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.partners }),
  });
}

export function useUpdatePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      kind?: PartnerKind;
      eik?: string | null;
      vatNumber?: string | null;
      address?: string | null;
      mol?: string | null;
      phone?: string | null;
      email?: string | null;
      bankAccount?: string | null;
    }) => updatePartner(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.partners }),
  });
}

export function useDeletePartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deletePartner,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.partners }),
  });
}

export function useProductsQuery(filters?: { groupId?: string; status?: ProductStatus; q?: string }) {
  const queryClient = useQueryClient();
  const queryKey = workspaceKeys.products(filters);
  return useQuery({
    queryKey,
    queryFn: () => fetchProducts(filters, { fresh: hasData(queryClient, queryKey) }),
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductWriteInput) => createProduct(input),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string } & Partial<ProductWriteInput>) => updateProduct(id, input),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useEnableBatchTracking() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => enableProductBatchTracking(id),
    onSuccess: () => {
      invalidateCatalog(queryClient);
      invalidateDocuments(queryClient);
    },
  });
}

export function useMergePendingProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, intoProductId }: { id: string; intoProductId: string }) => mergePendingProduct(id, intoProductId),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useArchiveProduct() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: archiveProduct,
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useAddSupplierCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...input }: { productId: string; partnerId: string; supplierCode: string }) =>
      addSupplierCode(productId, input),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useRemoveSupplierCode() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, mappingId }: { productId: string; mappingId: string }) =>
      removeSupplierCode(productId, mappingId),
    onSuccess: () => invalidateCatalog(queryClient),
  });
}

export function useUnitAliasesQuery() {
  return useQuery({
    queryKey: workspaceKeys.unitAliases,
    queryFn: fetchUnitAliases,
  });
}

export function useCreateUnitAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { raw: string; unit: UnitOfMeasure }) => createUnitAlias(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.unitAliases }),
  });
}

export function useUpdateUnitAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; raw?: string; unit?: UnitOfMeasure }) => updateUnitAlias(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.unitAliases }),
  });
}

export function useDeleteUnitAlias() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteUnitAlias,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: workspaceKeys.unitAliases }),
  });
}

function invalidateDocuments(queryClient: ReturnType<typeof useQueryClient>, id?: string) {
  queryClient.invalidateQueries({ queryKey: ['workspace', 'documents'] });
  if (id) queryClient.invalidateQueries({ queryKey: workspaceKeys.document(id) });
}

export function useDocumentsQuery(filters?: { status?: DocumentStatus; siteId?: string; type?: DocumentType }) {
  return useQuery({
    queryKey: workspaceKeys.documents(filters),
    queryFn: () => fetchDocuments(filters),
  });
}

/** How often an open document is re-read while its photos are being read. */
export const DOCUMENT_READING_POLL_MS = 3000;

export function useDocumentQuery(id: string | undefined) {
  const queryClient = useQueryClient();
  const queryKey = workspaceKeys.document(id ?? '');
  return useQuery({
    queryKey,
    // A refetch asks for a fresh copy: the service worker's saved one would still say "reading".
    queryFn: () => fetchDocument(id!, { fresh: hasData(queryClient, queryKey) }),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.document.extraction.reading ? DOCUMENT_READING_POLL_MS : false),
    // Keep polling in a background tab, so switching back shows the finished reading straight away.
    refetchIntervalInBackground: true,
  });
}

export function useCreateDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentWriteInput) => createDocument(input),
    onSuccess: () => invalidateDocuments(queryClient),
  });
}

export function useUpdateDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentUpdateInput) => updateDocument(id, input),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useAddDocumentLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DocumentLineWriteInput) => addDocumentLine(id, input),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useUpdateDocumentLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, ...input }: { lineId: string } & Partial<DocumentLineWriteInput>) =>
      updateDocumentLine(id, lineId, input),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useCreateProductFromLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, ...input }: { lineId: string } & CreateProductFromLineInput) => createProductFromLine(id, lineId, input),
    onSuccess: () => {
      invalidateDocuments(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
    },
  });
}

/** "Confirm as new product" for one a scan created: makes it a normal catalog product. */
export function useConfirmPendingProduct(documentId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (productId: string) => updateProduct(productId, { status: 'ACTIVE' }),
    onSuccess: () => {
      invalidateDocuments(queryClient, documentId);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
    },
  });
}

export function useDeleteDocumentLine(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (lineId: string) => deleteDocumentLine(id, lineId),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useSubmitDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => submitDocument(id),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function usePostDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (options: PostDocumentOptions = {}) => postDocument(id, options),
    onSuccess: () => {
      invalidateDocuments(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'stock'] });
    },
  });
}

export function useSetStocktakeCounts(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (counts: { lineId: string; countedQuantity: number | null }[]) => setStocktakeCounts(id, counts),
    onSuccess: (data) => queryClient.setQueryData(workspaceKeys.document(id), data),
  });
}

export function useStockQuery(siteId: string) {
  return useQuery({
    queryKey: workspaceKeys.stock(siteId),
    queryFn: () => fetchStock(siteId),
    enabled: Boolean(siteId),
  });
}

export function useMovementsQuery(siteId: string, productId: string | undefined, batchId?: string) {
  return useQuery({
    queryKey: workspaceKeys.movements(siteId, productId ?? '', batchId),
    queryFn: () => fetchMovements(siteId, productId!, batchId),
    enabled: Boolean(siteId && productId),
  });
}

export function useReorderQuery(siteId: string) {
  return useQuery({
    queryKey: workspaceKeys.reorder(siteId),
    queryFn: () => fetchReorder(siteId),
    enabled: Boolean(siteId),
  });
}

export function useSalesQuery(siteId: string, date: string) {
  return useQuery({
    queryKey: workspaceKeys.sales(siteId, date),
    queryFn: () => fetchSales(siteId, date),
    enabled: Boolean(siteId && date),
  });
}

export function useSaleQuery(id: string) {
  return useQuery({
    queryKey: workspaceKeys.sale(id),
    queryFn: () => fetchSale(id),
    enabled: Boolean(id),
  });
}

export function useSalesReportQuery(siteId: string, from: string, to: string) {
  return useQuery({
    queryKey: workspaceKeys.salesReport(siteId, from, to),
    queryFn: () => fetchSalesReport(siteId, from, to),
    enabled: Boolean(siteId && from && to),
  });
}

export function useMarginsQuery(siteId: string, from: string, to: string, by: 'product' | 'group', enabled = true) {
  return useQuery({
    queryKey: workspaceKeys.margins(siteId, from, to, by),
    queryFn: () => fetchMargins(siteId, from, to, by),
    enabled: enabled && Boolean(siteId && from && to),
  });
}

/** A sale or void changes stock and every sales figure, and with them the portions left and recipe costs. */
function invalidateSales(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['workspace', 'sales'] });
  queryClient.invalidateQueries({ queryKey: ['workspace', 'stock'] });
  queryClient.invalidateQueries({ queryKey: ['workspace', 'recipes'] });
}

export function useRecipesQuery(siteId: string) {
  return useQuery({
    queryKey: workspaceKeys.recipes(siteId),
    queryFn: () => fetchRecipes(siteId),
    enabled: Boolean(siteId),
  });
}

export function useRecipeQuery(siteId: string, productId: string) {
  return useQuery({
    queryKey: workspaceKeys.recipe(siteId, productId),
    queryFn: () => fetchRecipe(siteId, productId),
    enabled: Boolean(siteId && productId),
  });
}

export function useMenuQuery(siteId: string) {
  return useQuery({
    queryKey: workspaceKeys.menu(siteId),
    queryFn: () => fetchMenu(siteId),
    enabled: Boolean(siteId),
  });
}

export function useSaveRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ productId, ...input }: { productId: string } & RecipeWriteInput) => saveRecipe(productId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace', 'recipes'] }),
  });
}

export function useDeleteRecipe() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteRecipe,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['workspace', 'recipes'] }),
  });
}

export function useCreateSale() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SaleInput) => createSale(input),
    onSuccess: (data) => {
      queryClient.setQueryData(workspaceKeys.sale(data.sale.id), data);
      invalidateSales(queryClient);
    },
  });
}

export function useVoidSale(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (reason?: string) => voidSale(id, reason),
    onSuccess: (data) => {
      queryClient.setQueryData(workspaceKeys.sale(id), data);
      invalidateSales(queryClient);
    },
  });
}

export function useCancelDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelDocument(id),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useReverseDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ReverseDocumentInput) => reverseDocument(id, input),
    onSuccess: () => {
      invalidateDocuments(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'stock'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'vat'] });
      queryClient.invalidateQueries({ queryKey: ['workspace', 'activity'] });
    },
  });
}

export function useUploadDocumentCapture(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadDocumentCapture(id, file),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useRetryDocumentExtraction(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (captureId: string) => retryDocumentExtraction(id, captureId),
    onSuccess: () => {
      invalidateDocuments(queryClient, id);
      queryClient.invalidateQueries({ queryKey: ['workspace', 'products'] });
      queryClient.invalidateQueries({ queryKey: workspaceKeys.partners });
    },
  });
}
