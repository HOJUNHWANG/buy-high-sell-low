import { createBrowserClient } from "@supabase/ssr";
import type { UserResponse } from "@supabase/supabase-js";

export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

let userRequest: Promise<UserResponse> | null = null;
let authGeneration = 0;
let subscribed = false;

/** Share concurrent getUser checks; later checks still validate with Auth. */
export function getBrowserUser(): Promise<UserResponse> {
  const supabase = createSupabaseBrowserClient();
  if (!subscribed) {
    subscribed = true;
    supabase.auth.onAuthStateChange(event => {
      if (event === "INITIAL_SESSION") return;
      authGeneration++;
      userRequest = null;
    });
  }
  if (userRequest) return userRequest;
  const generation = authGeneration;
  const request: Promise<UserResponse> = supabase.auth.getUser()
    .then(result => generation === authGeneration ? result : getBrowserUser())
    .finally(() => { if (userRequest === request) userRequest = null; });
  userRequest = request;
  return request;
}
