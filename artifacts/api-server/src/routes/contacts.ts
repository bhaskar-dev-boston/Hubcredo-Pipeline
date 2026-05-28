import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../lib/auth";
import { supabase } from "../lib/supabase"; // adjust import to match your project

const router: IRouter = Router();

// GET /api/contacts — fetch all contacts for logged-in user
router.get("/contacts", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { data, error } = await supabase
      .from("contacts")
      .select("*")
      .eq("user_id", req.userId!)
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.json(data ?? []);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch contacts" });
  }
});

// POST /api/contacts — save a new contact
router.post("/contacts", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  const { first_name, last_name, email, phone, address1, city, state, postal_code, country, is_default } =
    req.body as {
      first_name: string; last_name: string; email: string; phone: string;
      address1: string; city: string; state?: string; postal_code: string;
      country?: string; is_default?: boolean;
    };

  if (!first_name || !last_name || !email || !phone || !address1 || !city || !postal_code) {
    res.status(400).json({ error: "All required fields must be provided" });
    return;
  }

  try {
    // If setting as default, unset previous default first
    if (is_default) {
      await supabase
        .from("contacts")
        .update({ is_default: false })
        .eq("user_id", req.userId!);
    }

    const { data, error } = await supabase
      .from("contacts")
      .insert({
        user_id: req.userId!,
        first_name, last_name, email, phone,
        address1, city, state: state ?? "",
        postal_code, country: country ?? "US",
        is_default: is_default ?? false,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: "Failed to save contact" });
  }
});

// DELETE /api/contacts/:id
router.delete("/contacts/:id", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  try {
    const { error } = await supabase
      .from("contacts")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.userId!);

    if (error) throw error;
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: "Failed to delete contact" });
  }
});

export default router;