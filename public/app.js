document.addEventListener("DOMContentLoaded", () => {
  /* =====================
     CONFIG
  ====================== */
  const API_BASE_URL = ""; // same-origin
  const PLAN_LINK = "https://mpago.li/1XoZc56";

  let pendingTrackingCode = null;

  /* =====================
     HELPERS
  ====================== */
  function $(id) {
    return document.getElementById(id);
  }

  function safeOnClick(element, handler) {
    if (element) {
      element.addEventListener("click", handler);
    }
  }

  /* =====================
     ELEMENTOS PRINCIPAIS
  ====================== */
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

  /* =====================
     ABRIR MODAL
  ====================== */
  if (startForm) {
    startForm.addEventListener("submit", (e) => {
      e.preventDefault();

      const code = trackingInput.value.trim();
      if (!code) {
        alert("Informe o código de rastreamento.");
        return;
      }

      pendingTrackingCode = code;

      identifyStep.classList.remove("hidden");
      successStep.classList.add("hidden");
      identifyModal.classList.remove("hidden");
    });
  }

  /* =====================
     CANCELAR
  ====================== */
  safeOnClick(cancelIdentify, () => {
    identifyModal.classList.add("hidden");
    pendingTrackingCode = null;
  });

  /* =====================
     CONFIRMAR MONITORAMENTO
  ====================== */
  safeOnClick(confirmIdentify, async () => {
    const email = userEmail.value.trim();

    if (!email) {
      alert("Informe seu email.");
      return;
    }

    try {
      const userRes = await fetch(`${API_BASE_URL}/users`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const user = await userRes.json();

      const trackRes = await fetch(`${API_BASE_URL}/trackings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
          tracking_code: pendingTrackingCode
        })
      });

      if (!trackRes.ok) {
        const err = await trackRes.json();
        alert(err.error || "Erro ao ativar monitoramento");
        return;
      }

      identifyStep.classList.add("hidden");
      successStep.classList.remove("hidden");
    } catch (err) {
      console.error(err);
      alert("Erro de conexão. Tente novamente.");
    }
  });

  /* =====================
     CTA PLANO ESSENCIAL
  ====================== */
  const paymentMessage =
    "Após o pagamento, o Plano Essencial é ativado manualmente em até 24h úteis.";

  safeOnClick(goToPlan, () => {
    alert(paymentMessage);
    window.location.href = PLAN_LINK;
  });

  safeOnClick(subscribePlan, () => {
    alert(paymentMessage);
    window.location.href = PLAN_LINK;
  });

  /* =====================
     SUPORTE
  ====================== */
  const supportBtn = $("supportBtn");
  const supportModal = $("supportModal");
  const closeSupport = $("closeSupport");
  const supportForm = $("supportForm");

  safeOnClick(supportBtn, () => supportModal.classList.remove("hidden"));
  safeOnClick(closeSupport, () => supportModal.classList.add("hidden"));

  if (supportForm) {
    supportForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      await fetch(`${API_BASE_URL}/events`, {
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

      alert("Chamado enviado. Retornaremos em até 24h úteis.");
      supportModal.classList.add("hidden");
    });
  }
});
