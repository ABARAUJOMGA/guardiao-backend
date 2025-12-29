import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "./mailer.js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * SIMULA consulta aos Correios
 * Depois trocamos pela real
 */
function consultarCorreiosSimulado(trackingCode) {
  // Para MVP: sempre retorna aguardando retirada
  return "AGUARDANDO RETIRADA";
}

export async function rodarMonitoramento() {
  console.log("Iniciando job de monitoramento");

  const { data: trackings, error } = await supabase
    .from("trackings")
    .select("*, users(email)")
    .eq("status", "active");

  if (error) {
    console.error("Erro ao buscar trackings", error);
    return;
  }

  for (const tracking of trackings) {
    const statusAtual = consultarCorreiosSimulado(tracking.tracking_code);

    const { data: regras } = await supabase
      .from("exception_rules")
      .select("*")
      .eq("notify", true);

    const regra = regras.find(r =>
      statusAtual.includes(r.status_match)
    );

    if (regra && !tracking.alert_sent) {
      console.log("Exceção detectada:", statusAtual);

      await enviarEmail({
        to: tracking.users.email,
        subject: "⚠️ Problema detectado na entrega",
        text: `
Detectamos um problema no envio ${tracking.tracking_code}.

Status atual: ${statusAtual}

Recomendamos avisar o cliente antes que ele perceba.
`
      });

      await supabase
        .from("trackings")
        .update({
          status: "exception",
          alert_sent: true,
          last_status_raw: statusAtual
        })
        .eq("id", tracking.id);
    }
  }

  console.log("Job finalizado");
}
