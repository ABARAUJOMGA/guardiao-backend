document.addEventListener("DOMContentLoaded", () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  const tbody = document.getElementById("trackingsBody");
  const planInfo = document.getElementById("planInfo");
  const upgradeBtn = document.getElementById("upgradeBtn");

  const emailGate = document.getElementById("emailGate");
  const emailInput = document.getElementById("emailInput");
  const loadByEmail = document.getElementById("loadByEmail");

  const statusFilter = document.getElementById("statusFilter");
  const prevPageBtn = document.getElementById("prevPage");
  const nextPageBtn = document.getElementById("nextPage");
  const pageInfo = document.getElementById("pageInfo");

  let userId = null;
  let userPlan = "free";
  let page = 1;
  const limit = 10;
  let status = "";

  function traduzirStatus(status) {
    return {
      active: "ATIVA",
      exception: "EXCEÇÃO",
      delivered: "ENTREGUE"
    }[status] || status.toUpperCase();
  }

  async function identificarPorEmail(email) {
    const res = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (!res.ok) throw new Error("Erro ao identificar usuário");

    const user = await res.json();

    userId = user.id;
    userPlan = user.plan;

    localStorage.setItem("guardiao_user_id", userId);
    localStorage.setItem("guardiao_user_plan", userPlan);

    return user;
  }

  async function carregarRastreios() {
    if (!userId) return;

    tbody.innerHTML =
      "<tr><td colspan='3'>Carregando...</td></tr>";

    const params = new URLSearchParams({
      page,
      limit
    });

    if (status) params.append("status", status);

    const res = await fetch(
      `/users/${userId}/trackings?${params.toString()}`
    );

    if (!res.ok) {
      tbody.innerHTML =
        "<tr><td colspan='3'>Erro ao carregar rastreamentos.</td></tr>";
      return;
    }

    const data = await res.json();

planInfo.innerText =
  `Plano atual: ${isEssential ? "Essencial" : "Gratuito"} — ` +
  `Uso atual: ${data.total} de ${max} envios`;


    tbody.innerHTML = "";

    if (!data.items.length) {
      tbody.innerHTML =
        "<tr><td colspan='3'>Nenhum rastreamento encontrado.</td></tr>";
      return;
    }

    data.items.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${t.tracking_code}</td>
        <td>${
          t.last_checked_at
            ? new Date(t.last_checked_at).toLocaleString("pt-BR")
            : "-"
        }</td>
        <td>${traduzirStatus(t.status)}</td>
      `;
      tbody.appendChild(tr);
    });

    pageInfo.innerText = `Página ${page}`;
    prevPageBtn.disabled = page === 1;
    nextPageBtn.disabled = page * limit >= data.total;
  }

  loadByEmail.onclick = async () => {
    const email = emailInput.value.trim();
    if (!email) return alert("Informe o email.");

    page = 1;

    try {
      await identificarPorEmail(email);
      await carregarRastreios();
    } catch {
      tbody.innerHTML =
        "<tr><td colspan='3'>Erro ao carregar rastreamentos.</td></tr>";
    }
  };

  statusFilter.onchange = () => {
    status = statusFilter.value;
    page = 1;
    carregarRastreios();
  };

  prevPageBtn.onclick = () => {
    if (page > 1) {
      page--;
      carregarRastreios();
    }
  };

  nextPageBtn.onclick = () => {
    page++;
    carregarRastreios();
  };

  const storedId = localStorage.getItem("guardiao_user_id");
  const storedPlan = localStorage.getItem("guardiao_user_plan");

  if (storedId) {
    userId = storedId;
    userPlan = storedPlan || "free";
    carregarRastreios();
  }

  upgradeBtn.onclick = () => {
    alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
    window.location.href = PLAN_LINK;
  };
});
