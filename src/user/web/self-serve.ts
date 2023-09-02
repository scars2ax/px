import { Router } from "express";
import sanitize from "sanitize-html";
import { UserSchema } from "../../shared/users/schema";
import * as userStore from "../../shared/users/user-store";
import { UserInputError } from "../../shared/errors";

const router = Router();

router.get("/", (req, res) => {
  res.render("user_index");
});

router.get("/lookup", (req, res) => {
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
  const { token, nickname: rawNickname } = req.body;
  const nicknameSchema = UserSchema.pick({ nickname: true });
  const result = nicknameSchema
    .transform(({ nickname }) => ({
      nickname: sanitize(nickname?.trim() ?? ""),
    }))
    .safeParse({ nickname: rawNickname });
  if (!result.success) {
    throw new UserInputError(result.error.message);
  }

  const existing = userStore.getUser(token);
  if (!existing) {
    throw new UserInputError("Invalid user token.");
  }

  const newNickname = result.data.nickname || null;
  userStore.upsertUser({ ...existing, nickname: newNickname });
  res.render("user_lookup", {
    user: { ...existing, nickname: newNickname },
    flash: { type: "success", message: "Nickname updated" },
  });
});

export { router as selfServeRouter };
