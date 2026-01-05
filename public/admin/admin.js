// Usa a mesma origem do site (funciona em prod, local, Railway, Cloudflare)
const API = "";
const ADMIN_KEY = "guardiao-admin-123";

async function carregar() {
  const res = await fetch(`${API}/admin/trackings`, {
    headers: { "X-ADMIN-KEY": ADMIN_KEY }
  });

  const data = await res.json();
  const tbody = document.querySelector("tbody");
  tbody.innerHTML = "";

  data.forEach(t => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${t.tracking_code}</td>
      <td>${t.last_status_raw || "-"}</td>
      <td>${t.alert_sent ? "SIM" : "NÃO"}</td>
      <td>
        <button data-a="check1">1ª</button>
        <button data-a="check2">2ª</button>
        <button data-a="exception">Exceção</button>
        <button data-a="email">Email</button>
        <button data-a="delivered">Entregue</button>
      </td>
    `;

    tr.querySelector("[data-a='check1']").onclick =
      () => post(`/admin/trackings/${t.id}/check`, { check_type: "first" });

    tr.querySelector("[data-a='check2']").onclick =
      () => post(`/admin/trackings/${t.id}/check`, { check_type: "second" });

    tr.querySelector("[data-a='exception']").onclick =
      () => criarExcecao(t.id);

    tr.querySelector("[data-a='email']").onclick =
      () => post(`/admin/trackings/${t.id}/send-email`);

    tr.querySelector("[data-a='delivered']").onclick =
      () => confirmarEntrega(t.id);

    tbody.appendChild(tr);
  });
}

async function post(path, body = {}) {
  await fetch(`${API}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ADMIN-KEY": ADMIN_KEY
    },
    body: JSON.stringify(body)
  });

  carregar();
}

function criarExcecao(id) {
  const status = prompt("Status bruto:");
  const type = prompt("Tipo da exceção:");
  const sev = prompt("Severidade (low, medium, high):");

  post(`/admin/trackings/${id}/exception`, {
    status_raw: status,
    exception_type: type,
    severity: sev
  });
}

function confirmarEntrega(id) {
  if (confirm("Marcar como entregue?")) {
    post(`/admin/trackings/${id}/delivered`);
  }
}

carregar();
