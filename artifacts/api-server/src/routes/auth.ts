import { Router, type IRouter } from "express";
import { supabase } from "../lib/supabase";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import {
  GetMeResponse,
  UpdateProfileBody,
  UpdateProfileResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

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
  });

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
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  });
});

router.post("/auth/logout", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const authHeader = req.headers["authorization"];
  const token = authHeader?.slice(7);
  if (token) {
    await supabase.auth.admin.signOut(token);
  }
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

export default router;
