import { NextResponse, type NextRequest } from "next/server";

const publicPaths = ["/", "/login", "/regulamin", "/polityka-prywatnosci", "/polityka-cookies"];
const publicAssetPattern = /\.(?:png|jpe?g|webp|gif|svg|ico|json)$/i;

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    publicAssetPattern.test(pathname)
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get("sb-access-token")?.value;

  if (!token) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
