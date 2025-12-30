const API_BASE_URL = "https://guardiao-backend-production.up.railway.app";
let pendingTrackingCode = null;


/* Abrir modal */
document.getElementById("startTrackingForm").addEventListener("submit", (e) => {
  e.preventDefault();
  pendingTrackingCode = document.getElementById("trackingCode").value.trim();

  identifyStep.classList.remove("hidden");
  successStep.classList.add("hidden");
  identifyModal.classList.remove("hidden");
});

/* Cancelar */
cancelIdentify.onclick = () => {
  identifyModal.classList.add("hidden");
  pendingTrackingCode = null;
};

/* Confirmar */
confirmIdentify.onclick = async () => {
  const name = userName.value.trim();
  const email = userEmail.value.trim();

  if (!name || !email) {
    alert("Preencha nome e email.");
    return;
  }

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
    alert(err.error);
    return;
  }

  identifyStep.classList.add("hidden");
  successStep.classList.remove("hidden");
};

/* CTA */
goToPlan.onclick = () => {
  window.location.href = "LINK_DO_MERCADO_PAGO_AQUI";
};



/* ====== SUPORTE ====== */
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
