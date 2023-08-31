import cookieParser from "cookie-parser";
import expressSession from "express-session";
import MemoryStore from "memorystore";
import { v4 } from "uuid";

const ONE_HOUR = 1000 * 60 * 60;

const secret = v4();

const cookieParserMiddleware = cookieParser(secret);

const sessionMiddleware = expressSession({
  secret,
  resave: false,
  saveUninitialized: false,
  store: new (MemoryStore(expressSession))({ checkPeriod: ONE_HOUR }),
  cookie: { sameSite: "strict", maxAge: ONE_HOUR },
});

const withSession = [cookieParserMiddleware, sessionMiddleware];

export { withSession };
