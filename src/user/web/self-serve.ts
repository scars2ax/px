import { Router } from "express";

const router = Router();

router.get("/", (req, res) => {
  res.render("user_index");
});

export { router as selfServeRouter };
