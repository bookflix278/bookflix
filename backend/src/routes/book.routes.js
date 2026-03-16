import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";

import {
  createBook,
  listBooks,
  getBook,
  downloadBook,
  topDownloads,
  recommended,
  deleteBook
} from "../controllers/book.controller.js";

import { uploadBookFiles, uploadBulkZip } from "../middlewares/upload.js";
import { bulkUploadZip } from "../utils/zipExtract.js";

const router = Router();

router.get("/", listBooks);

router.get("/top", topDownloads);

router.get("/recommended", recommended);

router.get("/:id", getBook);

router.get("/:id/download", requireAuth, downloadBook);

router.post("/", requireAuth, uploadBookFiles, createBook);

router.post("/bulk", requireAuth, uploadBulkZip, bulkUploadZip);

router.delete("/:id", requireAuth, deleteBook);

export default router;