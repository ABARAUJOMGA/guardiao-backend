import { createClient } from "@supabase/supabase-js";
import { enviarEmail } from "./mailer.js";

/**
 * Conexão com o Supabase
 */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/**
 * Simulação de consulta aos Correios
 * (depois trocamos pela real)
 */
function consultarCorreiosSimulado(trackingCode) {
  // Para MVP: sempre retorna um status problemático conhecido
  return "AGUARDANDO RETIRADA";
}

/**
 * Job principal de monitoramento
 */
export async function rodarMonitoramento() {
  console.log("Iniciando job de monitoramento");

  // 1. Buscar todos os trackings ativos
  const { data: trackings, error: trackingError } = await supabase
    .from("trackings")
    .select("*")
    .eq("status", "active");

  if (trackingError) {
    console.error("Erro ao buscar trackings:", trackingError);
    return;
  }

  // 2. Buscar regras de exceção que notificam
  const { data: regras, error: regrasError } = await supabase
    .from("exception_rules")
    .select("*")
    .eq("notify", true);

  if (regrasError) {
    console.error("Erro ao buscar regras de exceção:", regrasError);
    return;
  }

  // 3. Processar cada tracking
  for (const tracking of trackings) {
    try {
      const statusAtual = consultarCorreiosSimulado(tracking.tracking_code);

      // Verificar se o status bate com alguma regra
      const regraEncontrada = regras.find(regra =>
        statusAtual.includes(regra.status_match)
      );

      // Se não for exceção ou já foi alertado, pula
      if (!regraEncontrada || tracking.alert_sent) {
        continue;
      }

      console.log(
        `Exceção detectada para ${tracking.tracking_code}: ${statusAtual}`
      );

      // 4. Buscar email do usuário
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("email")
        .eq("id", tracking.user_id)
        .single();

      if (userError || !user?.email) {
        console.error(
          `Erro ao buscar usuário do tracking ${tracking.id}`,
          userError
        );
        continue;
      }

      // 5. Enviar e-mail
      await enviarEmail({
        to: user.email,
        subject: "⚠️ Problema detectado na entrega",
        text: `
Detectamos um problema no envio ${tracking.tracking_code}.

Status atual: ${statusAtual}

Recomendamos avisar o cliente antes que ele perceba.
        `
      });

      // 6. Atualizar tracking como exceção notificada
      const { error: updateError } = await supabase
        .from("trackings")
        .update({
          status: "exception",
          alert_sent: true,
          last_status_raw: statusAtual,
          last_checked_at: new Date().toISOString()
        })
        .eq("id", tracking.id);

      if (updateError) {
        console.error(
          `Erro ao atualizar tracking ${tracking.id}`,
          updateError
        );
      }

    } catch (err) {
      console.error(
        `Erro inesperado ao processar tracking ${tracking.id}`,
        err
      );
    }
  }

  console.log("Job de monitoramento finalizado");
}
