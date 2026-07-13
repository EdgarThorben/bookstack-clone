import { defineMiddleware } from "astro:middleware";
import { SESSION_COOKIE_NAME, getSessionUser } from "./lib/auth";
import { DEFAULT_LANG, LANG_COOKIE_NAME, isLang } from "./lib/i18n";

export const onRequest = defineMiddleware(async (context, next) => {
  const sessionId = context.cookies.get(SESSION_COOKIE_NAME)?.value;
  context.locals.user = sessionId ? await getSessionUser(sessionId) : null;

  const url = new URL(context.request.url);
  const requestedLang = url.searchParams.get("setLang");
  if (isLang(requestedLang)) {
    context.cookies.set(LANG_COOKIE_NAME, requestedLang, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
    url.searchParams.delete("setLang");
    return context.redirect(url.pathname + url.search, 303);
  }

  const cookieLang = context.cookies.get(LANG_COOKIE_NAME)?.value;
  context.locals.lang = isLang(cookieLang) ? cookieLang : DEFAULT_LANG;

  return next();
});
