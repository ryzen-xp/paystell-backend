import { Request, Response, NextFunction } from "express";
import { validate as isUUID } from "uuid";

// Define allowed entity types based on your entities
const ALLOWED_ENTITY_TYPES = [
  "User",
  "PaymentLink",
  "Payment",
  "Transaction",
  "Merchant",
  "Session",
  "WalletVerification",
  "TwoFactorAuth",
  "InAppNotification",
  "MerchantWebhook",
  "MerchantWebhookEvent",
  "RateLimitEvent",
  "EmailVerification",
];

export const validateEntityParams = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const { entityType, entityId } = req.params;

  // Validate entityType
  if (!entityType || !ALLOWED_ENTITY_TYPES.includes(entityType)) {
    res.status(400).json({
      status: "error",
      message: `Invalid entity type. Allowed types: ${ALLOWED_ENTITY_TYPES.join(", ")}`,
    });
    return;
  }

  // Validate entityId format (assuming UUID)
  if (!entityId || !isUUID(entityId)) {
    res.status(400).json({
      status: "error",
      message: "Invalid entity ID format. Must be a valid UUID.",
    });
    return;
  }

  next();
};
