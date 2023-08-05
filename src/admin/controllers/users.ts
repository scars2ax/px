import { Router } from "express";
import { z } from "zod";
import * as userStore from "../../proxy/auth/user-store";

const usersRouter = Router();

export const UserSchema = z
  .object({
    ip: z.array(z.string()).optional(),
    type: z.enum(["normal", "special"]).optional(),
    promptCount: z.number().optional(),
    tokenCount: z.number().optional(),
    createdAt: z.number().optional(),
    lastUsedAt: z.number().optional(),
    disabledAt: z.number().optional(),
    disabledReason: z.string().optional(),
  })
  .strict();

const UserSchemaWithToken = UserSchema.extend({
  token: z.string(),
}).strict();

function paginate(set: unknown[], page: number, pageSize: number = 20) {
  return {
    page,
    pageCount: Math.ceil(set.length / pageSize),
    items: set.slice((page - 1) * pageSize, page * pageSize),
    nextPage: page * pageSize < set.length ? page + 1 : null,
    prevPage: page > 1 ? page - 1 : null,
  };
}

/**
 * Returns a list of all users, sorted by prompt count and then last used time.
 * GET /admin/users
 */
usersRouter.get("/", (req, res) => {
  const users = userStore.getUsers().sort((a, b) => {
    if (a.promptCount !== b.promptCount) {
      return b.promptCount - a.promptCount;
    }
    return (b.lastUsedAt ?? 0) - (a.lastUsedAt ?? 0);
  });

  if (req.headers.accept?.includes("text/html")) {
    const page = Number(req.query.page) || 1;
    const { items, ...pagination } = paginate(users, page);

    return res.render("admin/list-users", {
      users: items,
      ...pagination,
    });
  }

  res.json({ users, count: users.length });
});

/**
 * Returns the user with the given token.
 * GET /admin/users/:token
 */
usersRouter.get("/:token", (req, res) => {
  const user = userStore.getUser(req.params.token);
  if (!user) {
    return res.status(404).json({ error: "Not found" });
  }
  res.json(user);
});

/**
 * Creates a new user.
 * Returns the created user's token.
 * POST /admin/users
 */
usersRouter.post("/", (_req, res) => {
  res.json({ token: userStore.createUser() });
});

/**
 * Updates the user with the given token, creating them if they don't exist.
 * Accepts a JSON body containing at least one field on the User type.
 * Returns the upserted user.
 * PUT /admin/users/:token
 */
usersRouter.put("/:token", (req, res) => {
  const result = UserSchema.safeParse(req.body);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  userStore.upsertUser({ ...result.data, token: req.params.token });
  res.json(userStore.getUser(req.params.token));
});

/**
 * Bulk-upserts users given a list of User updates.
 * Accepts a JSON body with the field `users` containing an array of updates.
 * Returns an object containing the upserted users and the number of upserts.
 * PUT /admin/users
 */
usersRouter.put("/", (req, res) => {
  const result = z.array(UserSchemaWithToken).safeParse(req.body.users);
  if (!result.success) {
    return res.status(400).json({ error: result.error });
  }
  const upserts = result.data.map((user) => userStore.upsertUser(user));
  res.json({
    upserted_users: upserts,
    count: upserts.length,
  });
});

/**
 * Disables the user with the given token. Optionally accepts a `disabledReason`
 * query parameter.
 * Returns the disabled user.
 * DELETE /admin/users/:token
 */
usersRouter.delete("/:token", (req, res) => {
  const user = userStore.getUser(req.params.token);
  const disabledReason = z
    .string()
    .optional()
    .safeParse(req.query.disabledReason);
  if (!disabledReason.success) {
    return res.status(400).json({ error: disabledReason.error });
  }
  if (!user) {
    return res.status(404).json({ error: "Not found" });
  }
  userStore.disableUser(req.params.token, disabledReason.data);
  res.json(userStore.getUser(req.params.token));
});

// UI-specific routes

export { usersRouter };
