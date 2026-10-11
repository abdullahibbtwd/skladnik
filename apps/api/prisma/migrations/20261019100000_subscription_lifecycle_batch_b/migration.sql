-- Batch B (step 1/2): add SUPERSEDED + QUEUED enum values only.
-- PostgreSQL requires new enum values to be committed before they can be used
-- in indexes/CHECKs — see 20261019110000_subscription_lifecycle_batch_b_constraints.

ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'SUPERSEDED';
ALTER TYPE "SubscriptionStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
