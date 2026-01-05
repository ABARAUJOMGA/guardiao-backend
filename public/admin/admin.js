document.addEventListener("DOMContentLoaded", () => {
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

  let page = 1;
  const limit = 20;
  let debounceTimer = null;

  const API = "";
const ADMIN_KEY = "guardiao-admin-123";

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

  /* =====================================================
     LISTAGEM / BUSCA / PAGINAÇÃO
  ===================================================== */

  async function carregar() {
    loadingRow();

    const email = searchInput.value.trim();
    const params = new URLSearchParams({
      page,
      limit
    });

    if (email) params.append("email", email);

    try {
      const data = await safeFetch(`/admin/trackings?${params.toString()}`);

      if (!data.items || data.items.length === 0) {
        loadingRow("Nenhum resultado encontrado.");
        return;
      }

      pageInfo.innerText = `Página ${page}`;
      rows.innerHTML = "";

      data.items.forEach(t => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${statusBadge(t.status)}</td>
          <td>${t.tracking_code}</td>
          <td>${t.users?.email || "-"}</td>
          <td>
  ${t.last_checked_at
    ? new Date(t.last_checked_at).toLocaleString("pt-BR")
    : (t.last_status_raw || "-")}
</td>
          <td>${t.alerts_count || 0}</td>
          <td class="actions">
            <button class="primary">Verificado</button>
            <button class="warn">Exceção</button>
            <button class="primary ${t.alert_sent ? "disabled" : ""}">
              Email
            </button>
            <button class="ok">Entregue</button>
            <button>Histórico</button>
          </td>
        `;

        const [
          checkBtn,
          excBtn,
          emailBtn,
          delBtn,
          histBtn
        ] = tr.querySelectorAll("button");

checkBtn.onclick = () =>
  post(`/admin/trackings/${t.id}/check`, {
    check_type: "manual"
  });


        excBtn.onclick = () => criarExcecao(t.id);

        emailBtn.onclick = () =>
          post(`/admin/trackings/${t.id}/send-email`);

        delBtn.onclick = () => {
          if (confirm("Marcar como entregue?")) {
            post(`/admin/trackings/${t.id}/delivered`);
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
     BUSCA COM DEBOUNCE
  ===================================================== */

  searchInput.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      page = 1;
      carregar();
    }, 400);
  });

  /* =====================================================
     PAGINAÇÃO
  ===================================================== */

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
     AÇÕES ADMIN (POST)
  ===================================================== */

  async function post(path, body = {}) {
    try {
      await safeFetch(path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      carregar();
    } catch (err) {
      alert("Erro: " + err.message);
    }
  }

async function criarExcecao(id) {
  const tipo = prompt("Tipo da exceção:");
  if (!tipo) return;

  const severidade = prompt(
    "Severidade:\n1 = Baixa\n2 = Média\n3 = Alta"
  );

  let severity;

  if (severidade === "1") severity = "low";
  else if (severidade === "2") severity = "medium";
  else if (severidade === "3") severity = "high";
  else {
    alert("Severidade inválida.");
    return;
  }

  await post(`/admin/trackings/${id}/exception`, {
    exception_type: tipo,
    severity
  });

  carregar();
}





  /* =====================================================
     HISTÓRICO
  ===================================================== */

async function abrirHistorico(trackingId) {
  try {
    historyModal.classList.remove("hidden");
    historyContent.innerHTML = "Carregando histórico…";

    const res = await safeFetch(
      `/admin/trackings/${trackingId}/history`
    );

    const checks = res.checks.map(c =>
      `<li>✔️ Verificado (${new Date(c.created_at).toLocaleString("pt-BR")})</li>`
    ).join("");

    const exceptions = res.exceptions.map(e =>
      `<li>⚠️ Exceção: ${e.exception_type} (${e.severity}) — ${e.status_raw}</li>`
    ).join("");

    const emails = res.emails.map(e =>
      `<li>📧 Email enviado (${new Date(e.created_at).toLocaleString("pt-BR")})</li>`
    ).join("");

    historyContent.innerHTML = `
      <h4>Linha do tempo</h4>
      <ul>
        ${checks || ""}
        ${exceptions || ""}
        ${emails || ""}
        ${(res.checks.length === 0 &&
   res.exceptions.length === 0 &&
   res.emails.length === 0)
   ? "<li>Nenhum evento.</li>"
   : ""}

      </ul>
    `;
  } catch (err) {
    historyContent.innerHTML = `Erro ao carregar histórico: ${err.message}`;
  }
}



  /* =====================================================
     START
  ===================================================== */

  carregar();
});


if (closeHistoryBtn && historyModal) {
  closeHistoryBtn.addEventListener("click", () => {
    historyModal.classList.add("hidden");
  });
}
