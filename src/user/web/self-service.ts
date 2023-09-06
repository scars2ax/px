import { Router } from "express";
import { z } from "zod";
import { UserPartialSchema } from "../../shared/users/schema";
import * as userStore from "../../shared/users/user-store";
import { UserInputError } from "../../shared/errors";
import { sanitizeAndTrim } from "../../shared/utils";
import { config } from "../../config";

const router = Router();

router.get("/", (_req, res) => {
  res.redirect("/");
});

router.get("/lookup", (_req, res) => {
  res.render("user_lookup", { user: null });
});

router.post("/lookup", (req, res) => {
  const token = req.body.token;
  const user = userStore.getUser(token);
  if (!user) {
    return res.status(401).render("user_lookup", {
      user: null,
      flash: { type: "error", message: "Invalid user token." },
    });
  }
  res.render("user_lookup", { user });
});

router.post("/edit-nickname", (req, res) => {
  if (!config.allowNicknameChanges)
    throw new UserInputError("Nickname changes are not allowed.");

  const schema = UserPartialSchema.pick({ token: true, nickname: true })
    .strict()
    .transform((v) => ({ ...v, nickname: sanitizeAndTrim(v.nickname) }));

  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new UserInputError(result.error.message);
  }

  const existing = userStore.getUser(result.data.token);
  if (!existing) {
    throw new UserInputError("Invalid user token.");
  }

  const newNickname = result.data.nickname || null;
  userStore.upsertUser({ token: existing.token, nickname: newNickname });
  res.render("user_lookup", {
    user: { ...existing, nickname: newNickname },
    flash: { type: "success", message: "Nickname updated" },
  });
});

export { router as selfServiceRouter };
