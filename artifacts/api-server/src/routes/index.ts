import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storefrontRouter from "./storefront";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);

export default router;
