document.addEventListener("DOMContentLoaded", () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  let pendingTrackingCode = null;
  let currentUser = null;

  const $ = id => document.getElementById(id);
  const safe = (el, fn) => el && el.addEventListener("click", fn);

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

  /* =========================
     STATUS DO PLANO (3A)
  ========================= */

  async function updatePlanStatus(user) {
    const box = $("planStatus");
    const planName = $("planName");
    const planUsage = $("planUsage");

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

  /* =========================
     ELEMENTOS
  ========================= */

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

  /* =========================
     FLUXO PRINCIPAL
  ========================= */

  startForm?.addEventListener("submit", e => {
    e.preventDefault();

    pendingTrackingCode = trackingInput.value.trim();
    if (!pendingTrackingCode) {
      alert("Informe o código de rastreamento.");
      return;
    }

    identifyStep.classList.remove("hidden");
    successStep.classList.add("hidden");
    identifyModal.classList.remove("hidden");
  });

  safe(cancelIdentify, () => identifyModal.classList.add("hidden"));

  safe(confirmIdentify, async () => {
    setLoading(confirmIdentify, true);

    try {
      // Cria ou recupera usuário
      currentUser = await fetch("/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail.value })
      }).then(r => r.json());

      // Salva para a página 3B
      localStorage.setItem("guardiao_user_id", currentUser.id);
      localStorage.setItem("guardiao_user_plan", currentUser.plan);

      // Cria rastreamento
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
        alert(err.error || "Limite de envios atingido.");
        return;
      }

      identifyStep.classList.add("hidden");
      successStep.classList.remove("hidden");

      await updatePlanStatus(currentUser);

    } catch (err) {
      console.error(err);
      alert("Erro ao ativar monitoramento.");
    } finally {
      setLoading(confirmIdentify, false);
    }
  });

  /* =========================
     UPGRADE
  ========================= */

  [goToPlan, subscribePlan].forEach(btn =>
    safe(btn, () => {
      alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
      window.location.href = PLAN_LINK;
    })
  );

  /* =========================
     MODAIS
  ========================= */

  document.querySelectorAll(".modal-close").forEach(btn =>
    btn.addEventListener("click", () =>
      btn.closest(".modal").classList.add("hidden")
    )
  );


/* =========================
   VER MEUS RASTREAMENTOS
========================= */

const myTrackingsBtn = document.getElementById("myTrackingsBtn");

if (myTrackingsBtn) {
  myTrackingsBtn.addEventListener("click", () => {
    const storedUserId = localStorage.getItem("guardiao_user_id");

    // Usuário já conhecido → acesso direto
    if (storedUserId) {
      window.location.href = "/meus-rastreamentos.html";
      return;
    }

    // Usuário não identificado → usar modal existente
    identifyStep.classList.remove("hidden");
    successStep.classList.add("hidden");
    identifyModal.classList.remove("hidden");

    // Sobrescreve comportamento do botão de confirmação APENAS UMA VEZ
    const handler = async () => {
      setLoading(confirmIdentify, true);

      try {
        const user = await fetch("/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email: userEmail.value })
        }).then(r => r.json());

        localStorage.setItem("guardiao_user_id", user.id);
        localStorage.setItem("guardiao_user_plan", user.plan);

        window.location.href = "/meus-rastreamentos.html";
      } catch (err) {
        alert("Erro ao identificar usuário.");
      } finally {
        setLoading(confirmIdentify, false);
        confirmIdentify.removeEventListener("click", handler);
      }
    };

    confirmIdentify.addEventListener("click", handler);
  });
}




  /* =========================
     SUPORTE
  ========================= */

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

    alert("Mensagem enviada com sucesso.");
    supportModal.classList.add("hidden");
  });
});
