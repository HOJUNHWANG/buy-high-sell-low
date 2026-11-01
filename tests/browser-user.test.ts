import { describe, expect, it, vi } from "vitest";
import type { User, UserResponse } from "@supabase/supabase-js";

const state = vi.hoisted(() => ({ getUser: vi.fn(), change: (event: string) => { void event; } }));
vi.mock("@supabase/ssr", () => ({ createBrowserClient: () => ({ auth: {
  getUser: state.getUser,
  onAuthStateChange: (callback: (event: string) => void) => { state.change = callback; },
} }) }));
import { getBrowserUser } from "@/lib/supabase/client";
const member = { data: { user: { id: "one" } as User }, error: null } as UserResponse;
const guest = { data: { user: null }, error: null } as UserResponse;

describe("concurrent browser user validation", () => {
  it("shares an in-flight check but revalidates a later check", async () => {
    let resolve!: (value: UserResponse) => void;
    state.getUser.mockReset().mockReturnValueOnce(new Promise<UserResponse>(done => { resolve = done; })).mockResolvedValue(member);
    const a = getBrowserUser(), b = getBrowserUser();
    expect(state.getUser).toHaveBeenCalledTimes(1);
    resolve(member);
    expect((await a).data.user?.id).toBe("one"); await b;
    await getBrowserUser();
    expect(state.getUser).toHaveBeenCalledTimes(2);
  });
  it("does not publish a pre-signout result after authentication changes", async () => {
    let resolve!: (value: UserResponse) => void;
    state.getUser.mockReset().mockReturnValueOnce(new Promise<UserResponse>(done => { resolve = done; })).mockResolvedValue(guest);
    const stale = getBrowserUser();
    state.change("SIGNED_OUT");
    resolve(member);
    expect((await stale).data.user).toBeNull();
    expect(state.getUser).toHaveBeenCalledTimes(2);
  });
});
