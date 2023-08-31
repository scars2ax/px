import { Router } from "express";
import { z } from "zod";
import { config } from "../../config";
import { ModelFamily, keyPool } from "../../shared/key-management";
import { getTokenCostUsd, prettyTokens } from "../../shared/stats";

const router = Router();

router.get("/", (req, res) => {
  res.render("user/index");
});

export { router as selfServeRouter };
