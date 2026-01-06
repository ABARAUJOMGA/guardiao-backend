document.addEventListener("DOMContentLoaded", () => {
  /* =====================================================
     CONFIG
  ===================================================== */

  const ADMIN_KEY = "guardiao-admin-123";
  const API = "";

  let page = 1;
  const limit = 20;
  let debounceTimer = null;

  /* =====================================================
     ELEMENTOS
  ===================================================== */

  const rows = document.getElementById("rows");
  const searchInput = document.getElementById("searchEmail");

  const prevPage = document.getElementById("prevPage");
  const nextPage = document.getElementById("nextPage");
  const pageInfo = document.getElementById("pageInfo");

  const historyModal = document.getElementById("historyModal");
  const historyContent = document.getElementById("historyContent");
  const closeHistoryBtn = historyModal.querySelector(".modal-close");

  const runMonitorBtn = document.getElementById("runMonitorBtn");

  /* =====================================================
     HELPERS
  ===================================================== */

  async function safeFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: {
        "X-ADMIN-KEY": ADMIN_KEY,
        ...(options.headers || {})
      },
      ...options
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erro inesperado");
    }

    return res.json();
  }

  function statusBadge(status) {
    if (status === "active") return `<span class="badge active">ATIVO</span>`;
    if (status === "exception") return `<span class="badge exception">EXCEÇÃO</span>`;
    if (status === "delivered") return `<span class="badge delivered">ENTREGUE</span>`;
    return status;
  }

  function loadingRow(text = "Carregando…") {
    rows.innerHTML = `<tr><td colspan="6">${text}</td></tr>`;
  }

  async function post(path, body = {}) {
    await safeFetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  /* =====================================================
     LISTAGEM
  ===================================================== */

  async function carregar() {
    loadingRow();

    const email = searchInput.value.trim();
    const params = new URLSearchParams({ page, limit });
    if (email) params.append("email", email);

    try {
      const data = await safeFetch(`/admin/trackings?${params.toString()}`);

      pageInfo.innerText = `Página ${page}`;
      rows.innerHTML = "";

      if (!data.items.length) {
        loadingRow("Nenhum resultado encontrado.");
        return;
      }

      data.items.forEach(t => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${statusBadge(t.status)}</td>
          <td>${t.tracking_code}</td>
          <td>${t.users?.email || "-"}</td>
          <td>${t.last_checked_at
            ? new Date(t.last_checked_at).toLocaleString("pt-BR")
            : (t.last_status_raw || "-")
          }</td>
          <td>${t.exceptions_count || 0}</td>
          <td class="actions">
            <button class="primary">Verificado</button>
            <button class="warn">Exceção</button>
            <button class="ok">Entregue</button>
            <button>Histórico</button>
          </td>
        `;

        const [checkBtn, excBtn, delBtn, histBtn] =
          tr.querySelectorAll("button");

        checkBtn.onclick = () =>
          post(`/admin/trackings/${t.id}/check`, { check_type: "manual" })
            .then(carregar);

        excBtn.onclick = () => criarExcecao(t.id);

        delBtn.onclick = () => {
          if (confirm("Marcar como entregue?")) {
            post(`/admin/trackings/${t.id}/delivered`).then(carregar);
          }
        };

        histBtn.onclick = () => abrirHistorico(t.id);

        rows.appendChild(tr);
      });

    } catch (err) {
      loadingRow(`Erro: ${err.message}`);
    }
  }

  /* =====================================================
     BUSCA
  ===================================================== */

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      page = 1;
      carregar();
    }, 400);
  });

  prevPage.onclick = () => {
    if (page > 1) {
      page--;
      carregar();
    }
  };

  nextPage.onclick = () => {
    page++;
    carregar();
  };

  /* =====================================================
     CRIAR EXCEÇÃO (GLOBAL + DISPARÁVEL)
  ===================================================== */

  async function criarExcecao(trackingId) {
    // 1️⃣ buscar templates globais
    const templates = await safeFetch("/admin/exceptions/templates");

    let msg = "Selecione a exceção:\n\n";
    templates.forEach((t, i) => {
      msg += `${i + 1} - ${t.exception_type} (${t.severity})\n`;
    });
    msg += "\n0 - Criar nova exceção";

    const escolha = prompt(msg);
    if (escolha === null) return;

    let exception_type;
    let severity;

    if (escolha === "0") {
      exception_type = prompt("Digite o nome da exceção:");
      if (!exception_type) return;

      const sev = prompt("Severidade:\n1=Baixa\n2=Média\n3=Alta");
      severity = sev === "1" ? "low" : sev === "2" ? "medium" : sev === "3" ? "high" : null;
      if (!severity) return alert("Severidade inválida");
    } else {
      const tpl = templates[parseInt(escolha) - 1];
      if (!tpl) return alert("Opção inválida");
      exception_type = tpl.exception_type;
      severity = tpl.severity;
    }

    await post(`/admin/trackings/${trackingId}/exception`, {
      exception_type,
      severity
    });

    alert("Exceção criada. Será notificada ao rodar o monitor.");
    carregar();
  }

  /* =====================================================
     HISTÓRICO
  ===================================================== */

  async function abrirHistorico(trackingId) {
    historyModal.classList.remove("hidden");
    historyContent.innerHTML = "Carregando…";

    try {
      const res = await safeFetch(`/admin/trackings/${trackingId}/history`);

      historyContent.innerHTML = `
        <ul>
          ${res.checks.map(c =>
            `<li>✔️ Verificado (${new Date(c.created_at).toLocaleString("pt-BR")})</li>`
          ).join("")}

          ${res.exceptions.map(e =>
            `<li>⚠️ ${e.exception_type} (${e.severity}) — ${e.status_raw}</li>`
          ).join("")}

          ${res.exceptions
  .filter(e => e.email_sent)
  .map(e =>
    `<li>📧 Email enviado — ${e.exception_type} (${new Date(e.created_at).toLocaleString("pt-BR")})</li>`
  ).join("")}
        </ul>
      `;
    } catch (err) {
      historyContent.innerText = err.message;
    }
  }

  closeHistoryBtn.onclick = () =>
    historyModal.classList.add("hidden");

  /* =====================================================
     RODAR MONITOR
  ===================================================== */

  runMonitorBtn.onclick = async () => {
    if (!confirm("Rodar monitor agora?")) return;

    runMonitorBtn.disabled = true;
    runMonitorBtn.innerText = "Executando...";

    try {
      await fetch("/run-monitor", {
        method: "POST",
        headers: { "X-ADMIN-KEY": ADMIN_KEY }
      });

      alert("Monitor executado. Emails pendentes processados.");
    } finally {
      runMonitorBtn.disabled = false;
      runMonitorBtn.innerText = "🚨 Rodar monitor";
      carregar();
    }
  };

  carregar();
});
