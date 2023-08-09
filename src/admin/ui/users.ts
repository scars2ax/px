import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import * as userStore from "../../proxy/auth/user-store";
import { UserSchemaWithToken, parseSort, sortBy, paginate } from "../common";

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== "application/json") {
      cb(new Error("Invalid file type"));
    } else {
      cb(null, true);
    }
  },
});

router.get("/create-user", (req, res) => {
  const recentUsers = userStore
    .getUsers()
    .sort(sortBy(["createdAt"], false))
    .slice(0, 5);
  res.render("admin/create-user", {
    recentUsers,
    newToken: !!req.query.created,
  });
});

router.post("/create-user", (_req, res) => {
  userStore.createUser();
  return res.redirect(`/admin/manage/create-user?created=true`);
});

router.get("/list-users", (req, res) => {
  const sort = parseSort(req.query.sort) || ["promptCount", "lastUsedAt"];
  const requestedPageSize =
    Number(req.query.perPage) || Number(req.cookies.perPage) || 20;
  const perPage = Math.max(1, Math.min(1000, requestedPageSize));
  const users = userStore.getUsers().sort(sortBy(sort, false));

  const page = Number(req.query.page) || 1;
  const { items, ...pagination } = paginate(users, page, perPage);

  return res.render("admin/list-users", {
    sort: sort.join(","),
    users: items,
    ...pagination,
  });
});

router.get("/import-users", (req, res) => {
  const imported = Number(req.query.imported) || 0;
  res.render("admin/import-users", { imported });
});

router.post("/import-users", upload.single("users"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }
  const data = JSON.parse(req.file.buffer.toString());
  const result = z.array(UserSchemaWithToken).safeParse(data.users);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  const upserts = result.data.map((user) => userStore.upsertUser(user));
  res.redirect(`/admin/manage/import-users?imported=${upserts.length}`);
});

router.get("/export-users", (_req, res) => {
  const users = userStore.getUsers();
  res.render("admin/export-users", { users });
});

export { router as usersUiRouter };
