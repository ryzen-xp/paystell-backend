import { Response } from "express";
import { Request } from "express-serve-static-core";
import { validate } from "class-validator";
import { StellarContractService } from "../services/StellarContractService";
import {
  MerchantRegistrationDTO,
  TokenSupportDTO,
  PaymentProcessingDTO,
} from "../dtos/StellarContractDTO";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";
import rateLimit from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { Redis, RedisOptions } from "ioredis";

export class StellarContractController {
  private contractService: StellarContractService;
  private redis: Redis;
  public paymentRateLimiter;

  constructor() {
    this.contractService = new StellarContractService();

    // Initialize Redis with proper options
    const redisOptions: RedisOptions = {
      host: process.env.REDIS_HOST || "localhost",
      port: parseInt(process.env.REDIS_PORT || "6379"),
      password: process.env.REDIS_PASSWORD,
      username: process.env.REDIS_USERNAME,
    };

    if (process.env.REDIS_URL) {
      this.redis = new Redis(process.env.REDIS_URL);
    } else {
      this.redis = new Redis(redisOptions);
    }

    // Initialize rate limiter after Redis
    this.paymentRateLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each merchant to 100 requests per windowMs
      message: "Too many payment requests, please try again later",
      standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
      legacyHeaders: false, // Disable the `X-RateLimit-*` headers
      store: new RedisStore({
        // @ts-expect-error - Known issue: the `call` function is not present in @types/ioredis
        sendCommand: (...args: string[]) => this.redis.call(...args),
        prefix: "rate-limit:payment:",
      }),
    });
  }

  /**
   * Register a new merchant
   */
  public registerMerchant = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const merchantData = new MerchantRegistrationDTO();
      Object.assign(merchantData, req.body);

      // Validate DTO
      const errors = await validate(merchantData);
      if (errors.length > 0) {
        throw new AppError("Validation failed", 400, errors);
      }

      const success = await this.contractService.registerMerchant(merchantData);

      if (success) {
        return res.status(201).json({
          message: "Merchant registered successfully",
          merchantAddress: merchantData.merchantAddress,
        });
      }

      throw new AppError("Failed to register merchant", 500);
    } catch (error) {
      logger.error("Merchant registration failed:", error);
      if (error instanceof AppError) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Add supported token for a merchant
   */
  public addSupportedToken = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const tokenData = new TokenSupportDTO();
      Object.assign(tokenData, req.body);

      // Validate DTO
      const errors = await validate(tokenData);
      if (errors.length > 0) {
        throw new AppError("Validation failed", 400, errors);
      }

      const success = await this.contractService.addSupportedToken(tokenData);

      if (success) {
        return res.status(200).json({
          message: "Token support added successfully",
          merchantAddress: tokenData.merchantAddress,
          tokenAddress: tokenData.tokenAddress,
        });
      }

      throw new AppError("Failed to add token support", 500);
    } catch (error) {
      logger.error("Adding token support failed:", error);
      if (error instanceof AppError) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Process a payment with signature verification
   */
  public processPayment = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const paymentData = new PaymentProcessingDTO();
      Object.assign(paymentData, req.body);

      // Validate DTO
      const errors = await validate(paymentData);
      if (errors.length > 0) {
        throw new AppError("Validation failed", 400, errors);
      }

      // Check payment order expiration
      if (paymentData.paymentOrder.expiration < Math.floor(Date.now() / 1000)) {
        throw new AppError("Payment order expired", 400);
      }

      const transactionHash =
        await this.contractService.processPayment(paymentData);

      return res.status(200).json({
        message: "Payment processed successfully",
        transactionHash,
        orderId: paymentData.paymentOrder.orderId,
      });
    } catch (error) {
      logger.error("Payment processing failed:", error);
      if (error instanceof AppError) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };

  /**
   * Get merchant details
   */
  public getMerchantDetails = async (
    req: Request,
    res: Response,
  ): Promise<Response> => {
    try {
      const { merchantAddress } = req.params;

      if (!merchantAddress) {
        throw new AppError("Merchant address is required", 400);
      }

      const merchantDetails =
        await this.contractService.getMerchantDetails(merchantAddress);

      return res.status(200).json(merchantDetails);
    } catch (error) {
      logger.error("Getting merchant details failed:", error);
      if (error instanceof AppError) {
        return res
          .status(error.statusCode)
          .json({ error: error.message, details: error.details });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  };
}
