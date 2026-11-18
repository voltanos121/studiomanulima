/* Studio Manu Lima — Mural individual de profissionais, com controle de status.
   A autorização real ocorre na função RPC staff_update_booking_status do Supabase. */
(() => {
  "use strict";
  const cfg = window.STUDIO_CONFIG || {};
  const db = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY)
    : null;
  const $ = selector => document.querySelector(selector);
  const synthetic = username => `${String(username).trim().toLowerCase()}@staff.studiomanulima.com`;
  const esc = value => String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[char]));
  const formatDate = value => new Date(`${value}T12:00:00`).toLocaleDateString("pt-BR");
  const formatTime = value => String(value || "").slice(0, 5);
  let activeUser = null;
  let busy = false;

  function showMessage(selector, message, isError = false) {
    const element = $(selector);
    if (!element) return;
    element.textContent = message;
    element.className = `form-feedback ${isError ? "error" : message ? "success" : ""}`.trim();
  }

  // Botões são exibidos somente em estados válidos. A função SQL também valida
  // o dono da reserva, a autenticação e a transição de estado.
  function actionsFor(booking) {
    const id = esc(booking.id);
    if (booking.status === "pendente") {
      return `<div class="employee-actions">
        <button type="button" data-employee-booking="${id}" data-employee-status="confirmado">Confirmar</button>
        <button type="button" class="employee-cancel" data-employee-booking="${id}" data-employee-status="cancelado">Cancelar</button>
      </div>`;
    }
    if (booking.status === "confirmado") {
      return `<div class="employee-actions">
        <button type="button" data-employee-booking="${id}" data-employee-status="concluido">Concluir</button>
        <button type="button" class="employee-cancel" data-employee-booking="${id}" data-employee-status="cancelado">Cancelar</button>
      </div>`;
    }
    return '<span class="hint">—</span>';
  }

  function table(rows, emptyText, allowActions = false) {
    if (!rows.length) return `<p class="hint">${esc(emptyText)}</p>`;
    const actionsHeader = allowActions ? "<th>Ações</th>" : "";
    const body = rows.map(booking => {
      const status = ["pendente", "confirmado", "cancelado", "concluido"].includes(booking.status)
        ? booking.status : "pendente";
      return `<tr>
        <td>${esc(booking.clientes?.nome || "Cliente")}</td>
        <td>${esc(booking.clientes?.telefone || "—")}</td>
        <td>${esc(booking.servicos?.nome || "—")}</td>
        <td>${formatDate(booking.data)}</td>
        <td>${formatTime(booking.horario_inicio)}–${formatTime(booking.horario_fim)}</td>
        <td><span class="status ${status}">${esc(booking.status)}</span></td>
        <td>${esc(booking.observacoes || "—")}</td>
        <td>${esc(booking.codigo || "—")}</td>
        ${allowActions ? `<td>${actionsFor(booking)}</td>` : ""}
      </tr>`;
    }).join("");
    return `<table><thead><tr><th>Cliente</th><th>WhatsApp</th><th>Serviço</th><th>Data</th><th>Horário</th><th>Status</th><th>Observações</th><th>Código</th>${actionsHeader}</tr></thead><tbody>${body}</tbody></table>`;
  }

  async function refreshAgenda() {
    if (!db || !activeUser) return;
    const refreshButton = $("#employeeRefresh");
    if (refreshButton) { refreshButton.disabled = true; refreshButton.textContent = "Atualizando..."; }
    try {
      const { data: profile, error: profileError } = await db.from("profissionais")
        .select("id,nome")
        .eq("auth_user_id", activeUser.id)
        .eq("tipo", "funcionario")
        .eq("ativo", true)
        .maybeSingle();
      if (profileError) throw profileError;
      if (!profile) {
        await db.auth.signOut();
        activeUser = null;
        $("#employeeArea").classList.add("hidden");
        $("#employeeLogin").classList.remove("hidden");
        $("#employeeLogout").classList.add("hidden");
        showMessage("#employeeFeedback", "Este acesso não está vinculado a um funcionário ativo. Fale com a administradora.", true);
        return;
      }
      $("#employeeLogin").classList.add("hidden");
      $("#employeeArea").classList.remove("hidden");
      $("#employeeLogout").classList.remove("hidden");
      $("#employeeName").textContent = `Olá, ${profile.nome}`;

      const { data, error } = await db.from("agendamentos")
        .select("id,codigo,data,horario_inicio,horario_fim,status,observacoes,clientes(nome,telefone),servicos(nome,preco)")
        .eq("profissional_id", profile.id)
        .order("data", { ascending: true })
        .order("horario_inicio", { ascending: true });
      if (error) throw error;
      const bookings = data || [];
      // Reservas antigas que ainda estão pendentes/confirmadas permanecem acionáveis.
      const open = bookings.filter(a => a.status === "pendente" || a.status === "confirmado");
      const history = bookings.filter(a => a.status === "cancelado" || a.status === "concluido");
      $("#myUpcomingCount").textContent = String(open.length);
      $("#myCompletedCount").textContent = String(bookings.filter(a => a.status === "concluido").length);
      $("#myUpcoming").innerHTML = table(open, "Você não possui atendimentos em aberto.", true);
      $("#myHistory").innerHTML = table(history.slice().reverse(), "Seu histórico aparecerá aqui após os primeiros atendimentos.");
    } catch (error) {
      console.error("Falha ao carregar agenda individual:", error);
      showMessage("#employeeActionFeedback", `Não foi possível carregar sua agenda: ${error.message || "Confira as permissões no Supabase."}`, true);
    } finally {
      if (refreshButton) { refreshButton.disabled = false; refreshButton.textContent = "Atualizar agenda"; }
    }
  }

  async function changeBookingStatus(button) {
    if (!db || busy) return;
    const bookingId = button.dataset.employeeBooking;
    const newStatus = button.dataset.employeeStatus;
    if (!["confirmado", "cancelado", "concluido"].includes(newStatus) || !bookingId) return;
    const confirmation = {
      cancelado: "Deseja realmente CANCELAR este agendamento? O horário poderá ficar disponível novamente.",
      concluido: "Este atendimento já foi realizado e pode ser marcado como CONCLUÍDO?"
    }[newStatus];
    if (confirmation && !window.confirm(confirmation)) return;
    busy = true;
    button.disabled = true;
    showMessage("#employeeActionFeedback", "Salvando alteração...");
    try {
      const { data, error } = await db.rpc("staff_update_booking_status", {
        p_booking_id: bookingId,
        p_new_status: newStatus
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.message || "O agendamento não pôde ser atualizado.");
      await refreshAgenda();
      showMessage("#employeeActionFeedback", `Agendamento ${newStatus} com sucesso.`);
    } catch (error) {
      console.error("Falha ao mudar status:", error);
      showMessage("#employeeActionFeedback", `Não foi possível alterar o agendamento: ${error.message || "Tente novamente."}`, true);
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  $("#employeeLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!db) {
      showMessage("#employeeFeedback", "Configure o Supabase no arquivo config.js.", true);
      return;
    }
    const form = new FormData(event.currentTarget);
    const { data, error } = await db.auth.signInWithPassword({
      email: synthetic(form.get("username")), password: String(form.get("password") || "")
    });
    if (error) {
      showMessage("#employeeFeedback", "Usuário ou senha incorretos.", true);
      return;
    }
    activeUser = data.user;
    await refreshAgenda();
  });

  $("#employeeArea").addEventListener("click", event => {
    const button = event.target.closest("button[data-employee-booking]");
    if (button) void changeBookingStatus(button);
  });
  $("#employeeRefresh").addEventListener("click", () => { showMessage("#employeeActionFeedback", ""); void refreshAgenda(); });
  $("#employeeLogout").addEventListener("click", async () => {
    activeUser = null;
    await db?.auth.signOut();
    location.reload();
  });
  if (db) {
    db.auth.getSession().then(({ data, error }) => {
      if (!error && data.session) { activeUser = data.session.user; void refreshAgenda(); }
    }).catch(error => console.error("Falha na sessão do funcionário:", error));
  }
})();
