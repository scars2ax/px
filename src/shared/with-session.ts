import cookieParser from "cookie-parser";
import expressSession from "express-session";
import MemoryStore from "memorystore";
import { COOKIE_SECRET } from "../config";

const ONE_HOUR = 1000 * 60 * 60;

const cookieParserMiddleware = cookieParser(COOKIE_SECRET);

const sessionMiddleware = expressSession({
  secret: COOKIE_SECRET,
  resave: false,
  saveUninitialized: false,
  store: new (MemoryStore(expressSession))({ checkPeriod: ONE_HOUR }),
  cookie: { sameSite: "strict", maxAge: ONE_HOUR, signed: true },
});

const withSession = [cookieParserMiddleware, sessionMiddleware];

export { withSession };
