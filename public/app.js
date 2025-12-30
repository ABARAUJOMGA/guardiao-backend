// ===== CONFIG =====
const API_BASE_URL = ""; // same-origin
const PLAN_LINK = "https://mpago.li/1XoZc56";

// ===== STATE =====
let pendingTrackingCode = null;

// ===== ELEMENTOS =====
const startForm = document.getElementById("startTrackingForm");
const trackingInput = document.getElementById("trackingCode");

const identifyModal = document.getElementById("identifyModal");
const identifyStep = document.getElementById("identifyStep");
const successStep = document.getElementById("successStep");

const userName = document.getElementById("userName");
const userEmail = document.getElementById("userEmail");

const confirmIdentify = document.getElementById("confirmIdentify");
const cancelIdentify = document.getElementById("cancelIdentify");
const goToPlan = document.getElementById("goToPlan");
const subscribePlan = document.getElementById("subscribePlan");

// suporte
const supportBtn = document.getElementById("supportBtn");
const supportModal = document.getElementById("supportModal");
const closeSupport = document.getElementById("closeSupport");
const supportForm = document.getElementById("supportForm");
const supportName = document.getElementById("supportName");
const supportEmail = document.getElementById("supportEmail");
const supportMessage = document.getElementById("supportMessage");

/* ===== CTA PLANO ===== */
goToPlan.onclick = () => {
  window.location.href = PLAN_LINK;
};

subscribePlan.onclick = () => {
  window.location.href = PLAN_LINK;
};

/* ===== ABRIR MODAL ===== */
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

/* ===== CANCELAR ===== */
cancelIdentify.onclick = () => {
  identifyModal.classList.add("hidden");
  pendingTrackingCode = null;
};

/* ===== CONFIRMAR ===== */
confirmIdentify.onclick = async () => {
  const email = userEmail.value.trim();

  if (!email) {
    alert("Preencha o email.");
    return;
  }

  try {
    const userRes = await fetch(`/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });

    const user = await userRes.json();

    const trackRes = await fetch(`/trackings`, {
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
    alert("Erro de conexão.");
    console.error(err);
  }
};

/* ===== SUPORTE ===== */
supportBtn.onclick = () => supportModal.classList.remove("hidden");
closeSupport.onclick = () => supportModal.classList.add("hidden");

supportModal.querySelector(".modal-overlay").onclick = () => {
  supportModal.classList.add("hidden");
};

supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await fetch(`/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "support_request",
      payload: {
        name: supportName.value,
        email: supportEmail.value,
        message: supportMessage.value
      }
    })
  });

  alert("Chamado enviado.");
  supportModal.classList.add("hidden");
});
