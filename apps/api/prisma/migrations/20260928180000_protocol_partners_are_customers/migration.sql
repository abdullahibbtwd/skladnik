-- OCR created every counterparty as SUPPLIER, including the recipient of a dispatch protocol.
-- Recipients become CUSTOMER, or BOTH when they also supply us (incoming documents or supplier codes).
UPDATE "Partner" p
SET "kind" = CASE
  WHEN EXISTS (SELECT 1 FROM "Document" d WHERE d."partnerId" = p."id" AND d."type" <> 'PROTOCOL')
    OR EXISTS (SELECT 1 FROM "SupplierProductCode" s WHERE s."partnerId" = p."id")
  THEN 'BOTH'::"PartnerKind"
  ELSE 'CUSTOMER'::"PartnerKind"
END
WHERE p."kind" = 'SUPPLIER'
  AND EXISTS (
    SELECT 1 FROM "Document" d
    WHERE d."partnerId" = p."id" AND d."type" = 'PROTOCOL' AND d."writeOffReason" IS NULL
  );
