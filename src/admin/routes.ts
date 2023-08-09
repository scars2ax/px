import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { config } from "../config";
import { authorize } from "./auth";
import { injectCsrfToken, checkCsrfToken } from "./csrf";
import { usersApiRouter } from "./api/users";
import { usersUiRouter } from "./ui/users";
import { loginRouter } from "./login";

const adminRouter = Router();

adminRouter.use(
  express.json({ limit: "20mb" }),
  express.urlencoded({ extended: true, limit: "20mb" })
);
adminRouter.use(cookieParser());
adminRouter.use(injectCsrfToken);

adminRouter.use("/", loginRouter);
adminRouter.use(authorize);

adminRouter.use("/manage", checkCsrfToken, usersUiRouter);
adminRouter.use("/users", usersApiRouter);

adminRouter.get("/", (_req, res) => {
  res.render("admin/index", {
    isPersistenceEnabled: config.gatekeeperStore !== "memory",
  });
});

export { adminRouter };
