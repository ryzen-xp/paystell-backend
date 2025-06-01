import { Router } from "express";
import { FraudController } from "../controllers/FraudController";
import { authMiddleware } from "../middlewares/authMiddleware";

const router = Router();
const fraudController = new FraudController();

router.use(authMiddleware);

// Get fraud alerts
router.get("/alerts", fraudController.getFraudAlerts);

// Review fraud alert
router.patch("/alerts/:alertId/review", fraudController.reviewFraudAlert);

// Get merchant fraud configuration
router.get("/config/:merchantId", fraudController.getMerchantConfig);

// Update merchant fraud configuration
router.put("/config/:merchantId", fraudController.updateMerchantConfig);

// Get fraud statistics
router.get("/stats", fraudController.getFraudStats);

export default router;