import { Router } from "express";
import { requireAuth, requireAdmin } from "../middlewares/auth.js";
import {
  adminStats,
  adminListBooks,
  adminDeleteBook,
  adminListUsers,
  adminToggleBan,
  adminToggleRole,
} from "../controllers/admin.controller.js";

const router = Router();

router.use(requireAuth, requireAdmin);

router.get("/stats", adminStats);

router.get("/books", adminListBooks);
router.delete("/books/:id", adminDeleteBook);

router.get("/users", adminListUsers);
router.patch("/users/:id/ban", adminToggleBan);
router.patch("/users/:id/role", adminToggleRole);

export default router;