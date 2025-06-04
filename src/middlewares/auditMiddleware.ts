import { Request, Response, NextFunction } from "express";
import { auditContext } from "../subscribers/AuditSubscriber";
import { AuditService } from "../services/AuditService";

export const auditMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const context = AuditService.extractContextFromRequest(req);

  auditContext.run(context, () => {
    next();
  });
};
