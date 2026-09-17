import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  addDocumentLine,
  addSupplierCode,
  archiveProduct,
  cancelDocument,
  createDocument,
  createInvite,
  createPartner,
  createProduct,
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
  fetchPartners,
  fetchProductGroups,
  fetchProducts,
  fetchSites,
  fetchUnitAliases,
  fetchUsers,
  postDocument,
  removeSupplierCode,
  resendInvite,
  retryDocumentExtraction,
  revokeInvite,
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
  type DocumentLineWriteInput,
  type DocumentUpdateInput,
  type DocumentWriteInput,
  type ProductWriteInput,
} from './workspace-api';
import type {
  DocumentStatus,
  DocumentType,
  PartnerKind,
  ProductStatus,
  SiteType,
  UnitOfMeasure,
  UserRole,
} from '@skladnik/shared';

export function useSitesQuery() {
  return useQuery({
    queryKey: workspaceKeys.sites,
    queryFn: fetchSites,
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
      taxId?: string | null;
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
  return useQuery({
    queryKey: workspaceKeys.products(filters),
    queryFn: () => fetchProducts(filters),
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

export function useDocumentQuery(id: string | undefined) {
  return useQuery({
    queryKey: workspaceKeys.document(id ?? ''),
    queryFn: () => fetchDocument(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => (query.state.data?.document.extraction.reading ? 2000 : false),
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
    mutationFn: () => postDocument(id),
    onSuccess: () => invalidateDocuments(queryClient, id),
  });
}

export function useCancelDocument(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => cancelDocument(id),
    onSuccess: () => invalidateDocuments(queryClient, id),
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
