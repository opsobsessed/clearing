import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

// Called once, automatically, right after someone signs in (see app/page.jsx). Checks whether the
// email on their now-verified session has an unclaimed pending_purchases row — i.e. they paid on
// /pricing before they had an account — and if so, grants it and marks it claimed so it can't be
// reused. The email comes from admin.auth.getUser(accessToken), not from the request body, so a
// client can't just claim someone else's purchase by guessing their email.
export async function POST(request) {
  const { accessToken } = await request.json();
  if (!accessToken) return Response.json({ error: "Missing accessToken" }, { status: 400 });
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Not configured yet." }, { status: 500 });
  }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userData?.user) {
    return Response.json({ error: "Could not verify your session." }, { status: 401 });
  }
  const email = (userData.user.email || "").toLowerCase();
  const userId = userData.user.id;
  if (!email) return Response.json({ claimed: false });

  const { data: purchase } = await admin
    .from("pending_purchases")
    .select("*")
    .eq("email", email)
    .eq("claimed", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!purchase) return Response.json({ claimed: false });

  if (purchase.plan === "full") {
    const { error } = await admin.from("profiles").update({ premium_unlocked: true }).eq("id", userId);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else if (purchase.plan === "trial") {
    const { error } = await admin
      .from("profiles")
      .update({ trial_started_at: new Date().toISOString() })
      .eq("id", userId)
      .is("trial_started_at", null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  } else {
    return Response.json({ claimed: false });
  }

  await admin.from("pending_purchases").update({ claimed: true, claimed_by: userId }).eq("id", purchase.id);

  return Response.json({ claimed: true, plan: purchase.plan });
}
