import { doubleCsrf } from "csrf-csrf";
import { v4 as uuid } from "uuid";
import express from "express";

const CSRF_SECRET = uuid();

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  cookieName: "csrf",
  cookieOptions: { sameSite: "strict", path: "/" },
  getTokenFromRequest: (req) => req.body["_csrf"] || req.query["_csrf"],
});

const injectCsrfToken: express.RequestHandler = (req, res, next) => {
  res.locals.csrfToken = generateToken(res, req);
  next();
};

export { injectCsrfToken, doubleCsrfProtection as checkCsrfToken };
