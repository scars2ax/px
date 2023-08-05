import { Router, Request, Response, NextFunction } from "express";

const loginRouter = Router();

loginRouter.get("/", (req: Request, res: Response, next: NextFunction) => {
  res.render("admin/login", { failed: req.query.failed });
});

loginRouter.post("/", (req: Request, res: Response, next: NextFunction) => {
  res.cookie("admin-token", req.body.token, {
    maxAge: 1000 * 60 * 60 * 24 * 14,
  });
  res.redirect("/admin");
});

export { loginRouter };
