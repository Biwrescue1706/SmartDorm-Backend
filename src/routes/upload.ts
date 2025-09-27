// src/routes/upload.ts
import { Router, Request, Response } from "express";
import multer from "multer";

const router = Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("slip"), (req: Request, res: Response) => {
  if (!req.file) {
    return res.status(400).json({ error: "❌ ไม่พบไฟล์" });
  }

  res.json({
    message: "✅ อัปโหลดสำเร็จ",
    filename: req.file.filename,
  });
});

export default router;
