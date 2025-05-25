import type { Request, Response, NextFunction } from "express";
import { PaymentService } from "../services/PaymentService";
import { TokenService } from "../services/TokenService";
import { SignatureVerificationService, PaymentSignatureData } from "../services/SignatureVerificationService";
import { AppError } from "../utils/AppError";
import logger from "../utils/logger";
import { validationResult } from "express-validator";

export class PaymentController {
  private paymentService: PaymentService;
  private tokenService: TokenService;
  private signatureService: SignatureVerificationService;

  constructor() {
    this.paymentService = new PaymentService();
    this.tokenService = new TokenService();
    this.signatureService = new SignatureVerificationService();
  }

  async createPayment(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      const payment = await this.paymentService.createPayment(req.body);
      const paymentUrl = this.paymentService.getPaymentUrl(payment.paymentId);

      res.status(201).json({
        payment,
        paymentUrl,
      });
    } catch (error) {
      next(error);
    }
  }

  async processPayment(req: Request, res: Response): Promise<void> {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: "Validation failed",
          errors: errors.array(),
        });
        return;
      }

      const { 
        payerAddress, 
        merchantAddress, 
        amount, 
        tokenAddress, 
        orderId, 
        expiration, 
        nonce,
        signature 
      } = req.body;

      // Validate signature if provided
      if (signature) {
        const signatureData: PaymentSignatureData = {
          payerAddress,
          merchantAddress,
          amount: amount.toString(),
          tokenAddress,
          orderId,
          expiration,
          nonce,
        };

        const isSignatureValid = await this.signatureService.verifyPaymentSignature(
          signatureData,
          signature,
          payerAddress
        );

        if (!isSignatureValid) {
          res.status(400).json({
            success: false,
            message: "Invalid payment signature",
          });
          return;
        }
      }

      // Validate Stellar addresses
      if (!this.signatureService.validateStellarAddress(payerAddress)) {
        res.status(400).json({
          success: false,
          message: "Invalid payer address format",
        });
        return;
      }

      if (!this.signatureService.validateStellarAddress(merchantAddress)) {
        res.status(400).json({
          success: false,
          message: "Invalid merchant address format",
        });
        return;
      }

      if (!this.signatureService.validateStellarAddress(tokenAddress)) {
        res.status(400).json({
          success: false,
          message: "Invalid token address format",
        });
        return;
      }

      // Validate token is supported by merchant
      const isTokenSupported = await this.tokenService.isTokenSupported(
        merchantAddress,
        tokenAddress
      );

      if (!isTokenSupported) {
        res.status(400).json({
          success: false,
          message: "Token not supported by merchant",
          merchantAddress,
          tokenAddress,
        });
        return;
      }

      // Check expiration with buffer
      if (!this.signatureService.validateExpiration(expiration)) {
        res.status(400).json({
          success: false,
          message: "Payment order expired",
        });
        return;
      }

      const result = await this.paymentService.processPayment(
        payerAddress,
        merchantAddress,
        amount,
        tokenAddress,
        orderId,
        expiration,
        nonce
      );
      
      logger.info(`Payment processed successfully: ${orderId}`);
      
      res.status(200).json({ 
        success: true, 
        message: "Payment processed successfully", 
        orderId,
        result 
      });
    } catch (error) {
      logger.error("Error processing payment:", error);
      
      if (error instanceof AppError) {
        res.status(error.statusCode).json({
          success: false,
          message: error.message,
          details: error.details,
        });
      } else {
        const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
        res.status(500).json({ 
          success: false, 
          message: errorMessage 
        });
      }
    }
  }

  async getPaymentById(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;

      if (!paymentId) {
        res.status(400).json({
          success: false,
          message: "Payment ID is required",
        });
        return;
      }

      const payment = await this.paymentService.getPaymentById(paymentId);

      if (!payment) {
        res.status(404).json({
          success: false,
          message: "Payment not found",
        });
        return;
      }

      res.status(200).json({
        success: true,
        payment,
      });
    } catch (error) {
      logger.error("Error getting payment:", error);
      
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }

  async updatePaymentStatus(req: Request, res: Response): Promise<void> {
    try {
      const { paymentId } = req.params;
      const { status } = req.body;

      if (!paymentId || !status) {
        res.status(400).json({
          success: false,
          message: "Payment ID and status are required",
        });
        return;
      }

      if (!["pending", "completed", "failed", "cancelled"].includes(status)) {
        res.status(400).json({
          success: false,
          message: "Invalid status. Must be: pending, completed, failed, or cancelled",
        });
        return;
      }

      const payment = await this.paymentService.updatePaymentStatus(paymentId, status);

      res.status(200).json({
        success: true,
        message: "Payment status updated successfully",
        payment,
      });
    } catch (error) {
      logger.error("Error updating payment status:", error);
      
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }

  /**
   * Verify a transaction on the Stellar network
   */
  async verifyTransaction(req: Request, res: Response): Promise<void> {
    try {
      const { transactionHash, expectedAmount, expectedDestination, expectedAsset } = req.body;

      if (!transactionHash || !expectedAmount || !expectedDestination || !expectedAsset) {
        res.status(400).json({
          success: false,
          message: "All fields are required: transactionHash, expectedAmount, expectedDestination, expectedAsset",
        });
        return;
      }

      const isValid = await this.signatureService.verifyTransactionOnNetwork(
        transactionHash,
        expectedAmount,
        expectedDestination,
        expectedAsset
      );

      res.status(200).json({
        success: true,
        isValid,
        transactionHash,
      });
    } catch (error) {
      logger.error("Error verifying transaction:", error);
      
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }

  /**
   * Generate a secure nonce for payment requests
   */
  async generateNonce(req: Request, res: Response): Promise<void> {
    try {
      const nonce = this.signatureService.generateNonce();
      
      res.status(200).json({
        success: true,
        nonce,
        expiresIn: 300, // 5 minutes
      });
    } catch (error) {
      logger.error("Error generating nonce:", error);
      
      const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
      res.status(500).json({
        success: false,
        message: errorMessage,
      });
    }
  }
}