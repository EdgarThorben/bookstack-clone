import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE_NAME, getSessionUser } from "./lib/auth";

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionId = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  context.locals.user = sessionId ? await getSessionUser(sessionId) : null;
  return next();
});
