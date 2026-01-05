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

  /* =====================================================
     HELPERS
  ===================================================== */

  async function safeFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
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
          <td>${t.last_status_raw || "-"}</td>
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

  function criarExcecao(id) {
    const status = prompt("Status bruto (ex: AGUARDANDO RETIRADA):");
    if (!status) return;

    const type = prompt("Tipo da exceção (ex: atraso, extravio):");
    if (!type) return;

    const severity = prompt("Severidade (low, medium, high):");
    if (!severity) return;

    post(`/admin/trackings/${id}/exception`, {
      status_raw: status,
      exception_type: type,
      severity
    });
  }

  /* =====================================================
     HISTÓRICO
  ===================================================== */

  async function abrirHistorico(id) {
    historyModal.classList.remove("hidden");
    historyContent.innerHTML = "Carregando…";

    try {
      const data = await safeFetch(`/admin/trackings/${id}/history`);

      if (!data.length) {
        historyContent.innerHTML = "Nenhum histórico encontrado.";
        return;
      }

      historyContent.innerHTML = data.map(e => `
        <div style="margin-bottom:8px;">
          <strong>${e.type}</strong><br/>
          <small>${e.detail || ""}</small><br/>
          <small>${new Date(e.created_at).toLocaleString()}</small>
        </div>
      `).join("");

    } catch (err) {
      historyContent.innerHTML = "Erro ao carregar histórico.";
    }
  }

  closeHistoryBtn.onclick = () =>
    historyModal.classList.add("hidden");

  /* =====================================================
     START
  ===================================================== */

  carregar();
});
