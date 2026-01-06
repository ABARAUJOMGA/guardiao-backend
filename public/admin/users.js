document.addEventListener("DOMContentLoaded", () => {
  const tbody = document.getElementById("usersRows");

  async function fetchJSON(url, options = {}) {
    const res = await fetch(url, {
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      ...options
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(text || "Erro");
    }

    return res.json();
  }

  function badge(status) {
    return status === "ATIVO"
      ? "<span class='badge active'>ATIVO</span>"
      : "<span class='badge warn'>VENCIDO</span>";
  }

  async function carregarClientes() {
    try {
      const users = await fetchJSON("/admin/users");
      tbody.innerHTML = "";

      if (!users.length) {
        tbody.innerHTML =
          "<tr><td colspan='6'>Nenhum cliente encontrado.</td></tr>";
        return;
      }

      users.forEach(u => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
          <td>${u.email}</td>
          <td>${u.plan}</td>
          <td>${u.paid_until ? new Date(u.paid_until).toLocaleDateString("pt-BR") : "-"}</td>
          <td>${badge(u.status)}</td>
          <td>${u.trackings_count}</td>
          <td>
            <button class="primary">Ativar plano</button>
            <button>Ver rastreios</button>
          </td>
        `;

        const [activateBtn, viewBtn] = tr.querySelectorAll("button");

        activateBtn.onclick = () => ativarPlano(u.id);
        viewBtn.onclick = () => {
          window.location.href =
            `/admin/admin.html?email=${encodeURIComponent(u.email)}`;
        };

        tbody.appendChild(tr);
      });
    } catch (err) {
      tbody.innerHTML =
        `<tr><td colspan="6">Erro: ${err.message}</td></tr>`;
    }
  }

  async function ativarPlano(userId) {
    const paidAt = prompt(
      "Data do pagamento (YYYY-MM-DD):",
      new Date().toISOString().slice(0, 10)
    );

    if (!paidAt) return;

    try {
      await fetchJSON(`/admin/users/${userId}/activate-plan`, {
        method: "POST",
        body: JSON.stringify({ paid_at: paidAt })
      });

      alert("Plano ativado com sucesso.");
      carregarClientes();
    } catch (err) {
      alert("Erro ao ativar plano.");
    }
  }

  carregarClientes();
});
