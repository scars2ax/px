import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { auth } from "./auth";
import { loginRouter } from "./controllers/login";
import { usersApiRouter } from "./api/users";
import { adminUiRouter } from "./controllers";

const adminRouter = Router();

adminRouter.use(
  express.json({ limit: "20mb" }),
  express.urlencoded({ extended: true, limit: "20mb" })
);
adminRouter.use(cookieParser());

adminRouter.use("/login", loginRouter);
adminRouter.use(auth);
adminRouter.use("/api/users", usersApiRouter);
adminRouter.use("/", adminUiRouter);

export { adminRouter };
