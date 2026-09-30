-- On its own: a new enum value can't be used in the transaction that adds it.
ALTER TYPE "DocumentType" ADD VALUE 'WRITE_OFF';
