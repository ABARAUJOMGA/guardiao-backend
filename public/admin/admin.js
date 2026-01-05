/* =========================
   CONFIG
========================= */

// Mesma origem (funciona em local, Railway, Cloudflare)
const API = "";
const ADMIN_KEY = "guardiao-admin-123";

/* =========================
   HELPERS
========================= */

async function safeFetch(url, options = {}) {
  const res = await fetch(url, options);

  // Se o backend devolver HTML por engano, pegamos aqui
  const contentType = res.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    const text = await res.text();
    throw new Error(
      "Resposta inválida do servidor (não é JSON).\n" +
      "Provável fallback HTML.\n\n" +
      text.slice(0, 200)
    );
  }

  return res.json();
}

function qs(selector) {
  return document.querySelector(selector);
}

/* =========================
   LOAD TRACKINGS
========================= */

async function carregar() {
  const tbody = qs("tbody");
  tbody.innerHTML = "<tr><td colspan='4'>Carregando...</td></tr>";

  try {
    const data = await safeFetch("/admin/trackings", {
      headers: {
        "X-ADMIN-KEY": ADMIN_KEY
      }
    });

    if (!Array.isArray(data) || data.length === 0) {
      tbody.innerHTML =
        "<tr><td colspan='4'>Nenhum rastreio ativo.</td></tr>";
      return;
    }

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

  } catch (err) {
    console.error(err);
    tbody.innerHTML = `
      <tr>
        <td colspan="4" style="color:red;">
          Erro ao carregar dados.<br>
          ${err.message}
        </td>
      </tr>
    `;
  }
}

/* =========================
   POST HELPERS
========================= */

async function post(path, body = {}) {
  try {
    await safeFetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-ADMIN-KEY": ADMIN_KEY
      },
      body: JSON.stringify(body)
    });

    carregar();

  } catch (err) {
    alert("Erro ao executar ação:\n\n" + err.message);
  }
}

/* =========================
   ACTIONS
========================= */

function criarExcecao(id) {
  const status = prompt("Status bruto:");
  if (!status) return;

  const type = prompt("Tipo da exceção:");
  if (!type) return;

  const sev = prompt("Severidade (low, medium, high):");
  if (!sev) return;

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

/* =========================
   START
========================= */

document.addEventListener("DOMContentLoaded", carregar);
