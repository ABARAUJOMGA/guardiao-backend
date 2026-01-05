document.addEventListener("DOMContentLoaded", () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";
  let pendingTrackingCode = null;
  let currentUser = null;

  const $ = id => document.getElementById(id);
  const safe = (el, fn) => el && el.addEventListener("click", fn);

async function updatePlanStatus(user) {
  const box = document.getElementById("planStatus");
  const planName = document.getElementById("planName");
  const planUsage = document.getElementById("planUsage");

  if (!box || !user) return;

  const isEssential = user.plan === "essential";
  const limit = isEssential ? 50 : 1;

  let trackings = [];
  try {
    const res = await fetch(`/trackings/${user.id}`);
    trackings = await res.json();
  } catch {}

  const activeCount = Array.isArray(trackings)
    ? trackings.filter(t => t.status === "active").length
    : 0;

  planName.innerText =
    `Plano atual: ${isEssential ? "Essencial" : "Gratuito"}`;

  planUsage.innerText =
    `Uso atual: ${activeCount} de ${limit} envios`;

  box.classList.remove("hidden");
}



  function setLoading(btn, on = true) {
    if (!btn) return;
    if (on) {
      btn.classList.add("btn-loading");
      btn.dataset.txt = btn.innerText;
      btn.innerText = "Processando...";
    } else {
      btn.classList.remove("btn-loading");
      btn.innerText = btn.dataset.txt || btn.innerText;
    }
  }

  async function updatePlanStatus(user) {
    const box = $("planStatus");
    const name = $("planName");
    const usage = $("planUsage");

    if (!user || !box) return;

    const limit = user.plan === "essential" ? 50 : 1;

    const trackings = await fetch(`/trackings/${user.id}`)
      .then(r => r.json())
      .catch(() => []);

    const activeCount = Array.isArray(trackings)
      ? trackings.filter(t => t.status === "active").length
      : 0;

    name.innerText =
      `Plano atual: ${user.plan === "essential" ? "Essencial" : "Gratuito"}`;

    usage.innerText =
      `Envios ativos: ${activeCount} de ${limit}`;

    box.classList.remove("hidden");
  }

  const startForm = $("startTrackingForm");
  const trackingInput = $("trackingCode");
  const identifyModal = $("identifyModal");
  const identifyStep = $("identifyStep");
  const successStep = $("successStep");
  const userEmail = $("userEmail");
  const confirmIdentify = $("confirmIdentify");
  const cancelIdentify = $("cancelIdentify");
  const goToPlan = $("goToPlan");
  const subscribePlan = $("subscribePlan");

  startForm?.addEventListener("submit", e => {
    e.preventDefault();
    pendingTrackingCode = trackingInput.value.trim();
    if (!pendingTrackingCode) return alert("Informe o código.");
    identifyStep.classList.remove("hidden");
    successStep.classList.add("hidden");
    identifyModal.classList.remove("hidden");
  });

  safe(cancelIdentify, () => identifyModal.classList.add("hidden"));

  safe(confirmIdentify, async () => {
    setLoading(confirmIdentify, true);
    try {
      currentUser = await fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail.value })
      }).then(r => r.json());

await updatePlanStatus(user);


      const res = await fetch("/trackings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: currentUser.id,
          tracking_code: pendingTrackingCode
        })
      });

      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "Limite atingido.");
        return;
      }

      identifyStep.classList.add("hidden");
      successStep.classList.remove("hidden");

      await updatePlanStatus(currentUser);

    } catch {
      alert("Erro ao ativar monitoramento.");
    } finally {
      setLoading(confirmIdentify, false);
    }
  });

  [goToPlan, subscribePlan].forEach(btn =>
    safe(btn, () => {
      alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
      window.location.href = PLAN_LINK;
    })
  );

  document.querySelectorAll(".modal-close").forEach(btn =>
    btn.addEventListener("click", () =>
      btn.closest(".modal").classList.add("hidden")
    )
  );

  const supportBtn = $("supportBtn");
  const supportModal = $("supportModal");
  const supportForm = $("supportForm");

  safe(supportBtn, () => supportModal.classList.remove("hidden"));

  supportForm?.addEventListener("submit", async e => {
    e.preventDefault();
    await fetch("/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "support_request",
        payload: {
          name: $("supportName").value,
          email: $("supportEmail").value,
          message: $("supportMessage").value
        }
      })
    });
    alert("Mensagem enviada.");
    supportModal.classList.add("hidden");
  });
});
