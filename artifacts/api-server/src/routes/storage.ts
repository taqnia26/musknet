import { Router, type IRouter } from "express";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/object-storage";

const router: IRouter = Router();
const storage = new ObjectStorageService();

router.get("/storage/objects/*objectPath", async (req, res) => {
  try {
    const value = req.params.objectPath;
    const relativePath = Array.isArray(value) ? value.join("/") : value;
    // Contract documents and draft marketing assets require permission-checked admin routes.
    if (relativePath.startsWith("uploads/contracts/files/") || relativePath.startsWith("local/contracts/") || relativePath.startsWith("uploads/marketing/")) {
      res.status(404).json({ error: "Object not found" });
      return;
    }
    const file = await storage.getObjectFile(`/objects/${relativePath}`);
    await storage.pipeObject(file, res);
  } catch (error) {
    if (error instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "Product image not found" });
      return;
    }
    req.log.error({ err: error }, "Failed to serve product image");
    res.status(500).json({ error: "Failed to serve product image" });
  }
});

export default router;