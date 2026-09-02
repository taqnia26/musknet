import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(
  "/api/media",
  express.static(path.resolve(import.meta.dirname, "../../../attached_assets")),
);
app.use(
  "/api/site-assets",
  express.static(path.resolve(import.meta.dirname, "../../musk-ellolo/public/site-assets")),
);
app.use("/api", router);
app.use((error: unknown, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  req.log.error({ err: error }, "Storefront request failed");
  if (!res.headersSent) {
    if (error instanceof Error && /^VAT_REGISTRATION_NUMBER/.test(error.message)) {
      res.status(503).json({ error: error.message });
      return;
    }
    res.status(500).json({ error: "تعذر إكمال الطلب. يرجى المحاولة مرة أخرى" });
  }
});

export default app;
