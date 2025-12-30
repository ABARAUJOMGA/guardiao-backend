import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

import { rodarMonitoramento } from "./monitor.js";
import { enviarEmail } from "./mailer.js";
import { adminAuth } from "./adminAuth.js";

/* =========================
   CONFIGURAÇÃO DE PATHS
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

/* =========================
   1. SEGURANÇA (CSP) - CORREÇÃO DO BLOQUEIO
========================= */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com; " +
    "connect-src 'self' https://guardiao-backend-production.up.railway.app https://*.supabase.co; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' data: https://fonts.gstatic.com; " +
    "img-src 'self' data:;"
  );
  next();
});

/* =========================
   2. MIDDLEWARES E CORS
========================= */
app.use(express.json());

const allowedOrigins = [
  "https://guardiaorastreamento.com.br",
  "https://www.guardiaorastreamento.com.br",
  "https://guardiao-backend-production.up.railway.app",
  "null"
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "X-ADMIN-KEY"]
  })
);

app.options("*", cors());

/* =========================
   3. ARQUIVOS ESTÁTICOS (FRONTEND)
========================= */
// Serve os arquivos da pasta public que você criou
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   4. CONEXÃO SUPABASE
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================
   5. ROTAS DE USUÁRIOS E PLANOS
========================= */

app.get("/health", (req, res) => res.json({ status: "online" }));

app.post("/users", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email obrigatório" });

  const { data: existing } = await supabase.from("users").select("*").eq("email", email).single();
  if (existing) return res.json(existing);

  const { data, error } = await supabase.from("users").insert([{ email }]).select().single();
  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   6. ROTAS DE RASTREAMENTO (TRACKINGS)
========================= */

app.post("/trackings", async (req, res) => {
  const { user_id, tracking_code } = req.body;

  // Verifica limite do plano
  const { data: user } = await supabase.from("users").select("plan").eq("id", user_id).single();
  const limit = user?.plan === "essential" ? 50 : 1;

  const { count } = await supabase.from("trackings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("status", "active");

  if (count >= limit) {
    return res.status(403).json({ error: `Limite de ${limit} envio(s) atingido para seu plano.` });
  }

  const { data, error } = await supabase.from("trackings")
    .insert([{ user_id, tracking_code, status: "active" }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

// Execução manual do monitor (Job)
app.post("/run-monitor", async (req, res) => {
  console.log("🚀 Monitoramento solicitado via API");
  await rodarMonitoramento();
  res.json({ status: "Monitoramento finalizado" });
});

/* =========================
   7. EVENTOS E SUPORTE
========================= */

app.post("/events", async (req, res) => {
  const { type, payload } = req.body;

  await supabase.from("events").insert([{ type, payload }]);

  if (type === "support_request") {
    await enviarEmail({
      to: "atendimento@abaraujo.com",
      subject: "📩 Novo chamado de suporte — Guardião",
      text: `Novo chamado recebido:\n\nNome: ${payload.name}\nEmail: ${payload.email}\n\nMensagem:\n${payload.message}`
    });
  }

  res.json({ ok: true });
});

/* =========================
   8. ÁREA ADMINISTRATIVA (COMPLETA)
========================= */

// Listar trackings ativos para o admin
app.get("/admin/trackings", adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("trackings")
    .select("*, users(email)")
    .is("delivered_at", null)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json(error);
  res.json(data);
});

// Atualizar status para entregue
app.post("/admin/trackings/:id/delivered", adminAuth, async (req, res) => {
  const { error } = await supabase
    .from("trackings")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString()
    })
    .eq("id", req.params.id);

  if (error) return res.status(400).json(error);
  res.json({ ok: true });
});

// Marcar alerta como enviado
app.post("/admin/trackings/:id/ack-alert", adminAuth, async (req, res) => {
  const { error } = await supabase
    .from("trackings")
    .update({ alert_sent: true })
    .eq("id", req.params.id);

  if (error) return res.status(400).json(error);
  res.json({ ok: true });
});

/* =========================
   9. FALLBACK FRONTEND (RESOLVE 404)
========================= */

// Esta rota deve ser a ÚLTIMA. Ela entrega o index.html para qualquer rota não mapeada.
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`
  ✅ SERVIDOR ONLINE: Porta ${PORT}
  📂 Pasta estática: ${path.join(__dirname, "public")}
  🌐 Domínio: https://guardiaorastreamento.com.br
  `);
});