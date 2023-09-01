import { Router } from "express";
import sanitizeHtml from "sanitize-html";
import * as userStore from "../../shared/users/user-store";
import { UserSchema } from "../../admin/common";
import { UserInputError } from "../../shared/errors";

const router = Router();

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
  const { token, nickname: nicknameRaw } = req.body;
  const nicknameSchema = UserSchema.pick({ nickname: true });
  const result = nicknameSchema
    .required()
    .transform(({ nickname }) => ({ nickname: sanitizeHtml(nickname) }))
    .safeParse({ nickname: nicknameRaw });
  if (!result.success) {
    throw new UserInputError(result.error.message);
  }

  const user = userStore.getUser(token);
  if (!user) {
    throw new UserInputError("Invalid user token.");
  }

  userStore.upsertUser({ ...user, nickname: result.data.nickname });
  res.render("user_lookup", {
    user: { ...user, nickname: result.data.nickname },
    flash: { type: "success", message: "Nickname updated" },
  });
});

export { router as selfServeRouter };
