import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";

// D-031: behind nginx, Next's request.url is the server's own `localhost:<port>`, so a redirect
// must be built from the public host nginx forwards.
describe("proxy redirects", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  });

  it("U-CR-012.1 an anonymous visit behind the proxy goes to the public /login", async () => {
    const request = new NextRequest("http://localhost:4005/stock", {
      headers: {
        host: "business.example.com",
        "x-forwarded-host": "business.example.com",
        "x-forwarded-proto": "https",
      },
    });
    const response = await proxy(request);
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://business.example.com/login");
  });

  it("U-CR-012.1 without a proxy it uses the request's own host", async () => {
    const request = new NextRequest("http://localhost:3000/stock", {
      headers: { host: "localhost:3000" },
    });
    const response = await proxy(request);
    expect(response.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
