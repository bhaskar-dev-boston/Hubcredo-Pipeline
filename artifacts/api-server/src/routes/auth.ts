import { Router, type IRouter } from "express";
import { createClient } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { grantCredits } from "../lib/credits";
import {
  GetMeResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";

const TRIAL_CREDITS = 100;

const router: IRouter = Router();
const FRONTEND_URL = process.env.FRONTEND_URL || "http://localhost:5173";

// Anon client specifically for OAuth code exchange
const supabaseAnon = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!
);

router.post("/auth/signup", async (req, res): Promise<void> => {
  const { email, password, full_name } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: full_name || "" },
  });

  if (error || !data.user) {
    req.log.warn({ error }, "Signup failed");
    res.status(400).json({ error: error?.message || "Signup failed" });
    return;
  }

  const userId = data.user.id;

  // Upsert profile
  await supabase.from("profiles").upsert({
    id: userId,
    email,
    full_name: full_name || null,
    onboarding_step: "not_started",
    onboarding_complete: false,
    credit_balance: 0,
  });

  // Grant trial credits
  try {
    await grantCredits(userId, TRIAL_CREDITS, "trial_grant", "Welcome! 100 free trial credits");
  } catch (err) {
    req.log.warn({ err }, "Failed to grant trial credits");
  }

  // Create a session token
  const { data: sessionData, error: sessionError } =
    await supabase.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

  if (sessionError) {
    req.log.warn({ sessionError }, "Session creation failed after signup");
  }

  // Sign in to get actual token
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.session) {
    res.status(201).json({ message: "Account created. Please log in." });
    return;
  }

  res.status(201).json({
    token: signInData.session.access_token,
    user: {
      id: userId,
      email,
      full_name: full_name || null,
    },
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const { email, password } = req.body;
  if (!email || !password) {
    res.status(400).json({ error: "Email and password required" });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.session) {
    req.log.warn({ error }, "Login failed");
    res.status(401).json({ error: error?.message || "Invalid credentials" });
    return;
  }

  // Upsert profile if missing
  await supabase.from("profiles").upsert({
    id: data.user.id,
    email: data.user.email!,
  });

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
});

router.post("/auth/refresh", async (req, res): Promise<void> => {
  const { refresh_token } = req.body;
  if (!refresh_token) {
    res.status(400).json({ error: "refresh_token required" });
    return;
  }

  const { data, error } = await supabase.auth.refreshSession({ refresh_token });

  if (error || !data.session) {
    req.log.warn({ error }, "Token refresh failed");
    res.status(401).json({ error: "Token refresh failed. Please log in again." });
    return;
  }

  res.json({
    token: data.session.access_token,
    refresh_token: data.session.refresh_token,
  });
});

router.post("/auth/logout", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  res.status(204).send();
});

router.get("/auth/me", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { data, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", req.userId!)
    .single();

  if (error || !data) {
    res.status(404).json({ error: "Profile not found" });
    return;
  }

  res.json(GetMeResponse.parse(data));
});

router.patch("/auth/profile", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates: Record<string, unknown> = { ...parsed.data, updated_at: new Date().toISOString() };

  const { data, error } = await supabase
    .from("profiles")
    .update(updates)
    .eq("id", req.userId!)
    .select()
    .single();

  if (error || !data) {
    req.log.error({ error }, "Profile update failed");
    res.status(500).json({ error: "Update failed" });
    return;
  }

  res.json(UpdateProfileResponse.parse(data));
});

router.get("/auth/oauth/callback", async (req, res) => {
  const code = req.query.code as string;

  if (!code) {
    return res.redirect(`${FRONTEND_URL}/login?error=no_code`);
  }

  const { data, error } = await supabaseAnon.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
  }

  // Upsert profile for new Google users
  await supabase.from("profiles").upsert({
    id: data.user.id,
    email: data.user.email!,
    full_name: data.user.user_metadata?.full_name || null,
  });

  const token = data.session.access_token;
  const refresh = data.session.refresh_token;

  res.redirect(`${FRONTEND_URL}/dashboard?token=${token}&refresh=${refresh}`);
});

export default router;