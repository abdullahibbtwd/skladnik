import {
  canStaffCreateDocumentType,
  isDocumentManager,
  type AuthUser,
  type DocumentType,
} from '@skladnik/shared';
import { apiForbidden } from '../common/api-error';

/**
 * Staff document rights (CASHIER F-01 / F-02).
 * - May create paper goods receipts / photo captures and write-offs for assigned sites.
 * - May edit / submit OWN drafts until submitted (DRAFT only for edit).
 * - Write-offs: recommended default = Staff posts directly (no cost threshold approval).
 * - May NOT post paper docs, cancel, reverse, transfer, stocktake, opening stock, or create products.
 */
export type StaffDocAction = 'create' | 'edit' | 'submit' | 'post' | 'cancel' | 'reverse' | 'manage';

export function assertDocumentWriteAccess(
  user: AuthUser,
  action: StaffDocAction,
  doc?: { type: DocumentType; status: string; createdById: string | null },
  createType?: DocumentType,
) {
  if (isDocumentManager(user.role)) return;

  if (user.role !== 'STAFF') {
    throw apiForbidden('DOCUMENT_ROLE_FORBIDDEN', 'Insufficient role for this document action');
  }

  if (action === 'cancel' || action === 'reverse' || action === 'manage') {
    throw apiForbidden('STAFF_DOCUMENT_FORBIDDEN', 'Staff cannot post, cancel or reverse documents of this kind');
  }

  if (action === 'create') {
    const type = createType!;
    if (!canStaffCreateDocumentType(type)) {
      throw apiForbidden('STAFF_DOCUMENT_TYPE', 'Staff can only create goods receipts, photo documents and write-offs');
    }
    return;
  }

  if (!doc) {
    throw apiForbidden('STAFF_DOCUMENT_FORBIDDEN', 'Document required');
  }

  if (!canStaffCreateDocumentType(doc.type)) {
    throw apiForbidden('STAFF_DOCUMENT_TYPE', 'Staff cannot change this document type');
  }

  if (doc.createdById !== user.id) {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Staff can only edit their own drafts');
  }

  if (action === 'edit' && doc.status !== 'DRAFT') {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Staff can only edit drafts until submitted for review');
  }

  if (action === 'submit' && doc.status !== 'DRAFT') {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Only a draft can be submitted for review');
  }

  // Product decision (recommended default): Staff posts write-offs directly; paper docs stay for manager review.
  if (action === 'post' && doc.type !== 'WRITE_OFF') {
    throw apiForbidden('STAFF_CANNOT_POST', 'Staff cannot post goods receipts — submit for review instead');
  }
}
