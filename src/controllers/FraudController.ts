import { Request, Response } from "express";
import { FraudDetectionService } from "../services/FraudDetectionService";
import { FraudAlertStatus } from "../entities/FraudAlert";

export class FraudController {
  private fraudService: FraudDetectionService;

  constructor() {
    this.fraudService = new FraudDetectionService();
  }

  // Get fraud alerts for a merchant or all
  getFraudAlerts = async (req: Request, res: Response) => {
    try {
      const { merchantId, status, limit = 50 } = req.query;
      
      const alerts = await this.fraudService.getFraudAlerts(
        merchantId as string,
        status as FraudAlertStatus,
        parseInt(limit as string)
      );

      res.json({
        success: true,
        data: alerts,
        count: alerts.length,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Review a fraud alert
  reviewFraudAlert = async (req: Request, res: Response) => {
    try {
      const { alertId } = req.params;
      const { status, reviewNotes } = req.body;
      const reviewedBy = req.user?.id ? String(req.user.id) : "system";

      const alert = await this.fraudService.reviewFraudAlert(
        alertId,
        status,
        reviewNotes,
        reviewedBy
      );

      res.json({
        success: true,
        data: alert,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Get merchant fraud configuration
  getMerchantConfig = async (req: Request, res: Response) => {
    try {
      const { merchantId } = req.params;
      const config = await this.fraudService.getMerchantConfig(merchantId);

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Update merchant fraud configuration
  updateMerchantConfig = async (req: Request, res: Response) => {
    try {
      const { merchantId } = req.params;
      const updates = req.body;

      const config = await this.fraudService.updateMerchantConfig(merchantId, updates);

      res.json({
        success: true,
        data: config,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };

  // Get fraud statistics
  getFraudStats = async (req: Request, res: Response) => {
    try {
      const { merchantId, days = 30 } = req.query;
      
      const stats = await this.fraudService.getFraudStats(
        merchantId as string,
        parseInt(days as string)
      );

      res.json({
        success: true,
        data: stats,
        period: `${days} days`,
        ...(merchantId && { merchantId }),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
      res.status(500).json({
        success: false,
        error: errorMessage,
      });
    }
  };
}