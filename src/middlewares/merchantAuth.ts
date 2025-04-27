// middleware/auth.ts
import {
  Request,
  Response,
  NextFunction,
  RequestHandler,
} from "express";
import { MerchantAuthService } from "../services/merchant.service";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";
import { UserRole } from "../enums/UserRole";
import { Merchant } from "../interfaces/webhook.interfaces";

// Augment the Express Request type
declare global {
  namespace Express {
    interface Request {
      merchant?: Merchant;
      user?: {
        id: number;
        email: string;
        tokenExp?: number;
        role?: UserRole;
        jti?: string;
      };
    }
  }
}

const merchantAuthService = new MerchantAuthService();

type AsyncRequestHandler<T = unknown> = (
  req: Request,
  res: Response,
  next: NextFunction,
)  => Promise<T>;

export const asyncHandler = (fn: AsyncRequestHandler): RequestHandler => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

export const authenticateMerchant = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    const apiKey = req.headers["x-api-key"] as string;

    if (!apiKey) {
      throw new AppError("API key is required", 401);
    }

    const merchant = await merchantAuthService.validateApiKey(apiKey);

    if (!merchant) {
      throw new AppError("Invalid API key", 401);
    }

    req.merchant = merchant;
    next();
  },
);

export const authenticateStellarWebhook = asyncHandler(
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const token = req.query.token as string;
      // Use your MerchantAuthService to find the merchant
      if (!token) {
        return res.status(401).json({
          error: "No token provided",
        });
      }

      if (token !== process.env.STELLAR_WEBHOOK_TOKEN) {
        return res.status(401).json({
          error: "Invalid token",
        });
      }

      const ip = req.headers["x-forwarded-for"] as string;

      if (ip !== process.env.STELLAR_WEBHOOK_IP) {
        return res.status(401).json({
          error: "Invalid IP address",
        });
      }
      // Attach merchant to request object
      return next();
    } catch (error) {
      console.error("Auth error:", error);
      return res.status(500).json({ error: "Authentication failed" });
    }
  },
);
