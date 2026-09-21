import { Router, type IRouter } from "express";
import healthRouter from "./health";
import storefrontRouter from "./storefront";
import adminRouter from "./admin";
import ownerRouter from "./owner";
import giftingRouter from "./gifting";
import storageRouter from "./storage";
import analyticsRouter from "./analytics";
import influencerRouter from "./influencer";
import whatsappRouter from "./whatsapp";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storefrontRouter);
router.use(storageRouter);
router.use(analyticsRouter);
router.use(adminRouter);
router.use(giftingRouter);
router.use(ownerRouter);
router.use(influencerRouter);
router.use(whatsappRouter);

export default router;
