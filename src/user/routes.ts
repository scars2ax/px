import express, { Router } from "express";
import cookieParser from "cookie-parser";
import { injectCsrfToken, checkCsrfToken } from "../csrf";
import { selfServeRouter } from "./web/self-serve";

const userRouter = Router();

userRouter.use(
  express.json({ limit: "20mb" }),
  express.urlencoded({ extended: true, limit: "20mb" })
);
userRouter.use(cookieParser());
userRouter.use(injectCsrfToken, checkCsrfToken);

userRouter.use(selfServeRouter);

userRouter.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    const data: any = { message: err.message, stack: err.stack };
    res.status(500).render("user/error", data);
  }
);

export { userRouter };
