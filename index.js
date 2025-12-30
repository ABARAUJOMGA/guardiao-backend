import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import path from "path";
import { fileURLToPath } from "url";

import { rodarMonitoramento } from "./monitor.js";
import { enviarEmail } from "./mailer.js";
import { adminAuth } from "./adminAuth.js";

/* =========================
   PATHS E APP INIT
========================= */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.set("trust proxy", 1);

/* =========================
   CSP (VERSÃO CORRETA E COMPATÍVEL)
========================= */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' data: https://fonts.gstatic.com https://fonts.googleapis.com",
      "img-src 'self' data:",
      "connect-src 'self' https://guardiao-backend-production.up.railway.app https://*.supabase.co",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'"
    ].join("; ")
  );
  next();
});

/* =========================
   MIDDLEWARES
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
   FRONTEND ESTÁTICO
========================= */
app.use(express.static(path.join(__dirname, "public")));

/* =========================
   SUPABASE
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Variáveis do Supabase não configuradas");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* =========================
   HEALTH CHECK
========================= */
app.get("/health", (req, res) => {
  res.json({ status: "Guardião API online" });
});

/* =========================
   USERS
========================= */
app.post("/users", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email obrigatório" });

  const { data: existing } = await supabase
    .from("users")
    .select("*")
    .eq("email", email)
    .single();

  if (existing) return res.json(existing);

  const { data, error } = await supabase
    .from("users")
    .insert([{ email }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   TRACKINGS (CRIAR)
========================= */
app.post("/trackings", async (req, res) => {
  const { user_id, tracking_code } = req.body;
  if (!user_id || !tracking_code) {
    return res.status(400).json({ error: "Dados obrigatórios" });
  }

  const { data: user } = await supabase
    .from("users")
    .select("plan")
    .eq("id", user_id)
    .single();

  const limit = user?.plan === "essential" ? 50 : 1;

  const { count } = await supabase
    .from("trackings")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user_id)
    .eq("status", "active");

  if (count >= limit) {
    return res.status(403).json({
      error: `Seu plano permite até ${limit} monitoramentos ativos`
    });
  }

  const { data, error } = await supabase
    .from("trackings")
    .insert([{ user_id, tracking_code, status: "active" }])
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   TRACKINGS (LISTAR DO USUÁRIO)
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("trackings")
    .select("*")
    .eq("user_id", user_id)
    .order("created_at", { ascending: false });

  if (error) return res.status(400).json({ error: error.message });
  res.json(data);
});

/* =========================
   JOB MANUAL
========================= */
app.post("/run-monitor", async (req, res) => {
  await rodarMonitoramento();
  res.json({ status: "Monitoramento executado" });
});

/* =========================
   ADMIN — LISTAR TRACKINGS
========================= */
app.get("/admin/trackings", adminAuth, async (req, res) => {
  const { data, error } = await supabase
    .from("trackings")
    .select("*, users(email)")
    .is("delivered_at", null)
    .order("created_at", { ascending: false });

  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

/* =========================
   ADMIN — CHECK MANUAL
========================= */
app.post("/admin/trackings/:id/check", adminAuth, async (req, res) => {
  const { check_type } = req.body;

  await supabase.from("tracking_checks").insert([{
    tracking_id: req.params.id,
    check_type
  }]);

  res.json({ ok: true });
});

/* =========================
   ADMIN — EXCEPTION
========================= */
app.post("/admin/trackings/:id/exception", adminAuth, async (req, res) => {
  const { exception_type, severity, status_raw } = req.body;

  await supabase.from("tracking_exceptions").insert([{
    tracking_id: req.params.id,
    exception_type,
    severity,
    status_raw
  }]);

  await supabase.from("trackings").update({
    status: "exception",
    flow_stage: "exception"
  }).eq("id", req.params.id);

  res.json({ ok: true });
});

/* =========================
   ADMIN — SEND EMAIL
========================= */
app.post("/admin/trackings/:id/send-email", adminAuth, async (req, res) => {
  const trackingId = req.params.id;

  const { data: tracking } = await supabase
    .from("trackings")
    .select("tracking_code, alert_sent, last_status_raw, users(email)")
    .eq("id", trackingId)
    .single();

  if (!tracking || tracking.alert_sent) {
    return res.status(409).json({ error: "Email já enviado ou inválido" });
  }

  await enviarEmail({
    to: tracking.users.email,
    subject: "⚠️ Atenção: encomenda requer ação",
    text: `
Código: ${tracking.tracking_code}
Status: ${tracking.last_status_raw || "Não informado"}

Plano Essencial permite até 50 monitoramentos ativos.
    `
  });

  await supabase.from("trackings")
    .update({ alert_sent: true })
    .eq("id", trackingId);

  res.json({ ok: true });
});

/* =========================
   ADMIN — DELIVERED
========================= */
app.post("/admin/trackings/:id/delivered", adminAuth, async (req, res) => {
  await supabase.from("trackings").update({
    status: "delivered",
    delivered_at: new Date().toISOString()
  }).eq("id", req.params.id);

  res.json({ ok: true });
});

/* =========================
   EVENTS (SUPORTE)
========================= */
app.post("/events", async (req, res) => {
  const { type, payload } = req.body;

  await supabase.from("events").insert([{ type, payload }]);

  if (type === "support_request") {
    await enviarEmail({
      to: "atendimento@abaraujo.com",
      subject: "📩 Novo chamado — Guardião",
      text: `
Nome: ${payload.name}
Email: ${payload.email}

Mensagem:
${payload.message}
      `
    });
  }

  res.json({ ok: true });
});

/* =========================
   FRONTEND FALLBACK
========================= */
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`🚀 Guardião rodando na porta ${PORT}`);
});
