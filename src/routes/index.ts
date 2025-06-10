import { Router } from "express";
import userRoutes from "./userRoutes";
import salesSummaryRoutes from "./salesSummary.routes";
import auditRoutes from "./audit.routes";
import { subscriptionRouter } from "./subscriptionRoutes";

const router = Router();

router.use("/", userRoutes);
router.use("/api/sales-summary", salesSummaryRoutes);
router.use("/subscriptions", subscriptionRouter);
router.use("/audit", auditRoutes);

export default router;
