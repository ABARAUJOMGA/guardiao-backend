document.addEventListener("DOMContentLoaded", () => {
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  /* =====================================================
     HELPERS
  ===================================================== */

  const $ = id => document.getElementById(id);

  function setLoading(btn, on = true) {
    if (!btn) return;
    if (on) {
      btn.classList.add("btn-loading");
      btn.dataset.originalText = btn.innerText;
      btn.innerText = "Processando...";
    } else {
      btn.classList.remove("btn-loading");
      btn.innerText = btn.dataset.originalText || btn.innerText;
    }
  }

  function getStoredUser() {
    const id = localStorage.getItem("guardiao_user_id");
    const plan = localStorage.getItem("guardiao_user_plan");
    if (!id || !plan) return null;
    return { id, plan };
  }

  function storeUser(user) {
    localStorage.setItem("guardiao_user_id", user.id);
    localStorage.setItem("guardiao_user_plan", user.plan);
  }

  /* =====================================================
     ELEMENTOS DA TELA
  ===================================================== */

  const startForm = $("startTrackingForm");
  const trackingInput = $("trackingCode");

  const planStatusBox = $("planStatus");
  const planName = $("planName");
  const planUsage = $("planUsage");
  const myTrackingsBtn = $("myTrackingsBtn");

  const identifyModal = $("identifyModal");
  const identifyStep = $("identifyStep");
  const successStep = $("successStep");

  const userEmailInput = $("userEmail");
  const confirmIdentifyBtn = $("confirmIdentify");
  const cancelIdentifyBtn = $("cancelIdentify");

  const subscribePlanBtn = $("subscribePlan");
  const goToPlanBtn = $("goToPlan");

  const supportBtn = $("supportBtn");
  const supportModal = $("supportModal");
  const supportForm = $("supportForm");

  /* =====================================================
     STATUS DO PLANO (HOME)
  ===================================================== */

  async function atualizarStatusPlano(user) {
    if (!planStatusBox) return;

    const isEssential = user.plan === "essential";
    const limite = isEssential ? 50 : 1;

    let trackings = [];
    try {
      const res = await fetch(`/trackings/${user.id}`);
      trackings = await res.json();
    } catch {}

    const ativos = Array.isArray(trackings)
      ? trackings.filter(t => t.status === "active").length
      : 0;

    planName.innerText =
      `Plano atual: ${isEssential ? "Essencial" : "Gratuito"}`;

    planUsage.innerText =
      `Uso atual: ${ativos} de ${limite} envios`;

    planStatusBox.classList.remove("hidden");
  }

  /* =====================================================
     IDENTIFICAÇÃO POR EMAIL (GENÉRICA)
  ===================================================== */

  async function identificarUsuario(email) {
    const res = await fetch("/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      throw new Error("Erro ao identificar usuário");
    }

    const user = await res.json();
    storeUser(user);
    return user;
  }

  function abrirModalIdentificacao({ titulo, texto }) {
    identifyStep.querySelector("h3").innerText = titulo;
    identifyStep.querySelector(".modal-text").innerText = texto;

    identifyStep.classList.remove("hidden");
    successStep.classList.add("hidden");
    identifyModal.classList.remove("hidden");
  }

  function fecharModalIdentificacao() {
    identifyModal.classList.add("hidden");
    userEmailInput.value = "";
  }

  /* =====================================================
     FLUXO 1 — CRIAR RASTREAMENTO
  ===================================================== */

  let pendingTrackingCode = null;

  startForm?.addEventListener("submit", e => {
    e.preventDefault();

    const code = trackingInput.value.trim();
    if (!code) {
      alert("Informe o código de rastreamento.");
      return;
    }

    pendingTrackingCode = code;

    abrirModalIdentificacao({
      titulo: "Ativar monitoramento",
      texto: "Precisamos do seu email para avisar caso algo saia do normal."
    });
  });

  
 
  /* =====================================================
     CONFIRMAR EMAIL (CRIA OU ACESSA)
  ===================================================== */

  confirmIdentifyBtn?.addEventListener("click", async () => {
    const email = userEmailInput.value.trim();
    if (!email) {
      alert("Informe o email.");
      return;
    }

    setLoading(confirmIdentifyBtn, true);

    try {
      const user = await identificarUsuario(email);

      // Se existe código pendente, cria rastreamento
      if (pendingTrackingCode) {
        const res = await fetch("/trackings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: user.id,
            tracking_code: pendingTrackingCode
          })
        });

        if (!res.ok) {
          const err = await res.json();
          alert(err.error || "Erro ao criar rastreamento.");
          return;
        }

        identifyStep.classList.add("hidden");
        successStep.classList.remove("hidden");

   const successPlanText = document.getElementById("successPlanText");
const upgradeHint = document.getElementById("upgradeHint");

const isEssential = user.plan === "essential";

if (isEssential) {
  successPlanText.innerText =
    "Monitoramento adicionado com sucesso. Seu Plano Essencial continua ativo.";

  goToPlanBtn.classList.add("hidden");

  upgradeHint.innerText =
    "Precisa monitorar ainda mais envios? Fale com o suporte para um plano personalizado.";
  upgradeHint.classList.remove("hidden");
} else {
  successPlanText.innerText =
    "Plano gratuito ativo (1 envio).";

  goToPlanBtn.classList.remove("hidden");

  upgradeHint.innerText =
    "Após o pagamento, a ativação ocorre em até 24h úteis.";
  upgradeHint.classList.remove("hidden");
}


        await atualizarStatusPlano(user);
        pendingTrackingCode = null;
      } else {
        // Caso seja só acesso
        window.location.href = "/meus-rastreamentos.html";
      }

    } catch (err) {
      alert("Erro ao processar solicitação.");
    } finally {
      setLoading(confirmIdentifyBtn, false);
    }
  });

  cancelIdentifyBtn?.addEventListener("click", fecharModalIdentificacao);

  /* =====================================================
     FLUXO 2 — VER MEUS RASTREAMENTOS (SEM CRIAR)
  ===================================================== */

  myTrackingsBtn?.addEventListener("click", () => {
    const stored = getStoredUser();

    if (stored) {
      window.location.href = "/meus-rastreamentos.html";
      return;
    }

    pendingTrackingCode = null;

    abrirModalIdentificacao({
      titulo: "Acessar meus rastreamentos",
      texto: "Informe seu email para acessar seus rastreamentos existentes."
    });
  });

  /* =====================================================
     UPGRADE DE PLANO
  ===================================================== */

  [subscribePlanBtn, goToPlanBtn].forEach(btn => {
    btn?.addEventListener("click", () => {
      alert("Após o pagamento, a ativação ocorre em até 24h úteis.");
      window.location.href = PLAN_LINK;
    });
  });

  /* =====================================================
     SUPORTE
  ===================================================== */

  supportBtn?.addEventListener("click", () => {
    supportModal.classList.remove("hidden");
  });

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

  /* =====================================================
     FECHAR MODAIS (X)
  ===================================================== */

  document.querySelectorAll(".modal-close").forEach(btn =>
    btn.addEventListener("click", () =>
      btn.closest(".modal").classList.add("hidden")
    )
  );

  /* =====================================================
     BOOTSTRAP — USUÁRIO JÁ CONHECIDO
  ===================================================== */

  const storedUser = getStoredUser();
  if (storedUser) {
    atualizarStatusPlano(storedUser);
  }
});
