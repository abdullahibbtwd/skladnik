import {
  canStaffCreateDocumentType,
  isDocumentManager,
  type AuthUser,
  type DocumentType,
} from '@skladnik/shared';
import { apiForbidden } from '../common/api-error';

/**
 * Staff document rights (CASHIER F-01 / F-02 / SKL-11).
 * - May create paper goods receipts / photo captures and write-offs for assigned sites.
 * - May edit / submit OWN drafts until submitted (DRAFT only for edit).
 * - SKL-11: may cancel OWN DRAFT only (not REVIEW / POSTED).
 * - Write-offs: recommended default = Staff posts directly (no cost threshold approval).
 * - May NOT post paper docs, reverse, transfer, stocktake, opening stock, or create products.
 * - CASHIER has no document write access (POS only — SKL-07).
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
    throw apiForbidden('DOCUMENT_ROLE_FORBIDDEN', 'Недостатъчни права за това действие върху документа');
  }

  if (action === 'reverse' || action === 'manage') {
    throw apiForbidden('STAFF_DOCUMENT_FORBIDDEN', 'Персоналът не може да сторнира или управлява този документ');
  }

  // SKL-11: Staff may cancel only their own DRAFT.
  if (action === 'cancel') {
    if (!doc) {
      throw apiForbidden('STAFF_DOCUMENT_FORBIDDEN', 'Документът е задължителен');
    }
    if (!canStaffCreateDocumentType(doc.type)) {
      throw apiForbidden('STAFF_DOCUMENT_TYPE', 'Персоналът не може да откаже този тип документ');
    }
    if (doc.createdById !== user.id) {
      throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Можете да откажете само собствена чернова');
    }
    if (doc.status !== 'DRAFT') {
      throw apiForbidden('STAFF_CANCEL_DRAFT_ONLY', 'Можете да откажете само чернова — след изпращане за преглед се свържете с мениджър');
    }
    return;
  }

  if (action === 'create') {
    const type = createType!;
    if (!canStaffCreateDocumentType(type)) {
      throw apiForbidden('STAFF_DOCUMENT_TYPE', 'Персоналът може да създава само стокови разписки, снимки на документи и брак');
    }
    return;
  }

  if (!doc) {
    throw apiForbidden('STAFF_DOCUMENT_FORBIDDEN', 'Документът е задължителен');
  }

  if (!canStaffCreateDocumentType(doc.type)) {
    throw apiForbidden('STAFF_DOCUMENT_TYPE', 'Персоналът не може да променя този тип документ');
  }

  if (doc.createdById !== user.id) {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Персоналът може да редактира само собствените си чернови');
  }

  if (action === 'edit' && doc.status !== 'DRAFT') {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Персоналът може да редактира чернови само до изпращане за преглед');
  }

  if (action === 'submit' && doc.status !== 'DRAFT') {
    throw apiForbidden('STAFF_OWN_DRAFT_ONLY', 'Само чернова може да се изпрати за преглед');
  }

  // Product decision (recommended default): Staff posts write-offs directly; paper docs stay for manager review.
  if (action === 'post' && doc.type !== 'WRITE_OFF') {
    throw apiForbidden('STAFF_CANNOT_POST', 'Персоналът не осчетоводява стокови документи — изпратете за преглед');
  }
}
