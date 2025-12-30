// ===== CONFIG =====
const API_BASE_URL = ""; // same-origin (evita CORS)

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

// suporte
const supportBtn = document.getElementById("supportBtn");
const supportModal = document.getElementById("supportModal");
const closeSupport = document.getElementById("closeSupport");
const supportForm = document.getElementById("supportForm");
const supportName = document.getElementById("supportName");
const supportEmail = document.getElementById("supportEmail");
const supportMessage = document.getElementById("supportMessage");

// ===== ABRIR MODAL =====
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

// ===== CANCELAR =====
cancelIdentify.onclick = () => {
  identifyModal.classList.add("hidden");
  pendingTrackingCode = null;
};

// ===== CONFIRMAR =====
confirmIdentify.onclick = async () => {
  const name = userName.value.trim();
  const email = userEmail.value.trim();

  if (!name || !email) {
    alert("Preencha nome e email.");
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
    alert("Erro de conexão. Tente novamente.");
    console.error(err);
  }
};

// ===== CTA PLANO =====
goToPlan.onclick = () => {
  window.location.href = "LINK_DO_MERCADO_PAGO_AQUI";
};

// ===== SUPORTE =====
supportBtn.onclick = () => supportModal.classList.remove("hidden");
closeSupport.onclick = () => supportModal.classList.add("hidden");

supportModal.querySelector(".modal-overlay").onclick = () => {
  supportModal.classList.add("hidden");
};

supportForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  await fetch(`${API_BASE_URL}/events`, {
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

  alert("Chamado enviado. Retornaremos em até 24h úteis.");
  supportModal.classList.add("hidden");
});
