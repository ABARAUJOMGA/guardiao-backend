document.addEventListener("DOMContentLoaded", async () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  const tbody = document.getElementById("trackingsBody");
  const planInfo = document.getElementById("planInfo");
  const upgradeBtn = document.getElementById("upgradeBtn");

  const emailGate = document.getElementById("emailGate");
  const emailInput = document.getElementById("emailInput");
  const loadByEmail = document.getElementById("loadByEmail");

  upgradeBtn.onclick = () => {
    alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
    window.location.href = PLAN_LINK;
  };

  let userId = localStorage.getItem("guardiao_user_id");
  let plan = localStorage.getItem("guardiao_user_plan");

  if (!userId) {
    emailGate.classList.remove("hidden");

    loadByEmail.onclick = async () => {
      const email = emailInput.value.trim();
      if (!email) return alert("Informe o email.");

      const user = await fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      }).then(r => r.json());

      localStorage.setItem("guardiao_user_id", user.id);
      localStorage.setItem("guardiao_user_plan", user.plan);

      location.reload();
    };

    return;
  }

  try {
    const res = await fetch(`/trackings/${userId}`);
    const trackings = await res.json();

    const isEssential = plan === "essential";
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
        <td>${t.last_status_raw || "-"}</td>
        <td>${t.status}</td>
      `;
      tbody.appendChild(tr);
    });

  } catch (err) {
    console.error(err);
    tbody.innerHTML =
      "<tr><td colspan='3'>Erro ao carregar rastreamentos.</td></tr>";
  }
});
