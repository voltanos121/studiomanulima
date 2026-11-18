import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido." }, 405);

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization") || "";
  const token = authHeader.replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Sessão não encontrada. Entre novamente." }, 401);

  const callerClient = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Nunca confiar em IDs, e-mails ou papéis enviados pelo navegador.
  const { data: authData, error: authError } = await callerClient.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Sessão inválida ou expirada." }, 401);
  const callerId = authData.user.id;

  const { data: permission, error: permissionError } = await adminClient
    .from("admins").select("user_id").eq("user_id", callerId).maybeSingle();
  if (permissionError || !permission) return json({ error: "Acesso restrito a administradores." }, 403);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Corpo da solicitação inválido." }, 400); }
  const action = String(body.action || "");

  try {
    if (action === "list") {
      const allUsers: any[] = [];
      for (let page = 1; page <= 20; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 100 });
        if (error) throw error;
        allUsers.push(...data.users);
        if (data.users.length < 100) break;
      }
      const { data: adminRows, error } = await adminClient.from("admins").select("user_id");
      if (error) throw error;
      const ids = new Set((adminRows || []).map((r: { user_id: string }) => r.user_id));
      const users = allUsers.filter((u) => ids.has(u.id)).map((u) => ({
        id: u.id,
        email: u.email || "",
        name: String(u.user_metadata?.full_name || u.user_metadata?.name || ""),
        created_at: u.created_at,
      })).sort((a, b) => a.email.localeCompare(b.email));
      return json({ users });
    }

    const id = String(body.id || "");
    if (action === "create") {
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const password = String(body.password || "");
      if (!name || name.length > 100) return json({ error: "Informe um nome válido (até 100 caracteres)." }, 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
      if (password.length < 8) return json({ error: "A senha precisa ter pelo menos 8 caracteres." }, 400);
      const { data: created, error: createError } = await adminClient.auth.admin.createUser({
        email, password, email_confirm: true, user_metadata: { full_name: name },
      });
      if (createError || !created.user) throw createError || new Error("Não foi possível criar a conta.");
      const { error: insertError } = await adminClient.from("admins").insert({ user_id: created.user.id });
      if (insertError) {
        await adminClient.auth.admin.deleteUser(created.user.id);
        throw insertError;
      }
      return json({ success: true, id: created.user.id });
    }

    if (!id) return json({ error: "Identificador do administrador não informado." }, 400);
    const { data: target, error: targetError } = await adminClient.from("admins").select("user_id").eq("user_id", id).maybeSingle();
    if (targetError || !target) return json({ error: "Administrador não encontrado." }, 404);

    if (action === "update") {
      const update: Record<string, unknown> = {};
      if (body.name !== undefined) {
        const name = String(body.name).trim();
        if (!name || name.length > 100) return json({ error: "Informe um nome válido (até 100 caracteres)." }, 400);
        const { data: existing } = await adminClient.auth.admin.getUserById(id);
        update.user_metadata = { ...(existing.user?.user_metadata || {}), full_name: name };
      }
      if (body.email !== undefined) {
        const email = String(body.email).trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Informe um e-mail válido." }, 400);
        update.email = email;
        update.email_confirm = true;
      }
      if (body.password !== undefined && String(body.password).length > 0) {
        if (String(body.password).length < 8) return json({ error: "A nova senha precisa ter pelo menos 8 caracteres." }, 400);
        update.password = String(body.password);
      }
      if (Object.keys(update).length === 0) return json({ error: "Nenhuma alteração foi informada." }, 400);
      const { error } = await adminClient.auth.admin.updateUserById(id, update);
      if (error) throw error;
      return json({ success: true });
    }

    if (action === "delete") {
      if (id === callerId) return json({ error: "Por segurança, você não pode excluir a própria conta enquanto está conectado." }, 400);
      const { count, error: countError } = await adminClient.from("admins").select("user_id", { count: "exact", head: true });
      if (countError) throw countError;
      if ((count || 0) <= 1) return json({ error: "O último administrador não pode ser excluído." }, 400);
      const { error: removeRoleError } = await adminClient.from("admins").delete().eq("user_id", id);
      if (removeRoleError) throw removeRoleError;
      const { error: deleteUserError } = await adminClient.auth.admin.deleteUser(id);
      if (deleteUserError) {
        await adminClient.from("admins").insert({ user_id: id });
        throw deleteUserError;
      }
      return json({ success: true });
    }

    return json({ error: "Ação não reconhecida." }, 400);
  } catch (error) {
    console.error("manage-admins:", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno ao gerenciar administradores." }, 400);
  }
});
