document.addEventListener("DOMContentLoaded", async () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  const tbody = document.getElementById("trackingsBody");
  const planInfo = document.getElementById("planInfo");
  const upgradeBtn = document.getElementById("upgradeBtn");

  const emailGate = document.getElementById("emailGate");
  const emailInput = document.getElementById("emailInput");
  const loadByEmail = document.getElementById("loadByEmail");

  function traduzirStatus(status) {
    return {
      active: "ATIVA",
      exception: "EXCEÇÃO",
      delivered: "ENTREGUE"
    }[status] || status.toUpperCase();
  }

  async function carregarPorUser(user) {
    const res = await fetch(`/trackings/${user.id}`);
    const trackings = await res.json();

    const isEssential = user.plan === "essential";
    const limit = isEssential ? 50 : 1;

    const activeCount = Array.isArray(trackings)
      ? trackings.filter(t => t.status === "active").length
      : 0;

    planInfo.innerText =
      `Plano atual: ${isEssential ? "Essencial" : "Gratuito"} — ` +
      `Uso: ${activeCount} de ${limit}`;

    tbody.innerHTML = "";

    if (!trackings.length) {
      tbody.innerHTML =
        "<tr><td colspan='3'>Nenhum rastreamento encontrado.</td></tr>";
      return;
    }

    trackings.forEach(t => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
  <td>${t.tracking_code}</td>
  <td>
    ${
      t.last_checked_at
        ? new Date(t.last_checked_at).toLocaleString("pt-BR")
        : "-"
    }
  </td>
  <td>${traduzirStatus(t.status)}</td>
`;
      tbody.appendChild(tr);
    });
  }

  async function identificarPorEmail(email) {
    const user = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    }).then(r => r.json());

    localStorage.setItem("guardiao_user_id", user.id);
    localStorage.setItem("guardiao_user_plan", user.plan);

    return user;
  }

  // Sempre permitir troca de email
  emailGate.classList.remove("hidden");

  loadByEmail.onclick = async () => {
    const email = emailInput.value.trim();
    if (!email) return alert("Informe o email.");

    try {
      tbody.innerHTML =
        "<tr><td colspan='3'>Carregando...</td></tr>";

      const user = await identificarPorEmail(email);
      await carregarPorUser(user);
    } catch {
      tbody.innerHTML =
        "<tr><td colspan='3'>Erro ao carregar rastreamentos.</td></tr>";
    }
  };

  // Carrega automaticamente se já houver usuário salvo
  const storedId = localStorage.getItem("guardiao_user_id");
  const storedPlan = localStorage.getItem("guardiao_user_plan");

  if (storedId && storedPlan) {
    carregarPorUser({ id: storedId, plan: storedPlan });
  }

  upgradeBtn.onclick = () => {
    alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
    window.location.href = PLAN_LINK;
  };
});
