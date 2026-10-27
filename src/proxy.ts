import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

// SRS §11: refresh the session on every request and send anonymous users to /login. Next 16
// calls middleware "proxy" (D-048).
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const onLogin = request.nextUrl.pathname === "/login";
  if (!user && !onLogin) return redirectWithCookies(request, response, "/login");
  if (user && onLogin) return redirectWithCookies(request, response, "/");
  return response;
}

// A redirect that keeps any refreshed session cookies. Behind nginx, request.url is the server's
// own localhost:<port>, so the public host comes from the forwarded headers (D-031).
function redirectWithCookies(request: NextRequest, response: NextResponse, path: string) {
  const own = new URL(request.url);
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? own.host;
  const proto = request.headers.get("x-forwarded-proto") ?? own.protocol.slice(0, -1);
  const redirect = NextResponse.redirect(new URL(path, `${proto}://${host}`));
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // Everything except Next internals, static files and the public logo (D-039).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|logo$|.*\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
