import { doubleCsrf } from "csrf-csrf";
import { v4 as uuid } from "uuid";
import express from "express";

const CSRF_SECRET = uuid();

const { generateToken, doubleCsrfProtection } = doubleCsrf({
  getSecret: () => CSRF_SECRET,
  cookieName: "csrf",
  cookieOptions: { sameSite: "strict", path: "/" },
  getTokenFromRequest: (req) => {
    const val = req.body["_csrf"] || req.query["_csrf"];
    delete req.body["_csrf"];
    return val;
  },
});

const injectCsrfToken: express.RequestHandler = (req, res, next) => {
  const session = req.session as any;
  if (!session.csrf) {
    req.log.debug("Generating new CSRF token");
    session.csrf = generateToken(res, req);
  }
  res.locals.csrfToken = session.csrf;
  next();
};

export { injectCsrfToken, doubleCsrfProtection as checkCsrfToken };
