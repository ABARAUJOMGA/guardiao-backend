import express from "express";
import cors from "cors";
import { createClient } from "@supabase/supabase-js";
import { rodarMonitoramento } from "./monitor.js";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIG
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error("❌ Variáveis do Supabase não configuradas");
}

const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY
);

/* =========================
   HEALTH CHECK
========================= */
app.get("/", (req, res) => {
  res.json({ status: "Guardião API online" });
});

/* =========================
   CREATE USER
========================= */
app.post("/users", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email obrigatório" });
    }

    const { data, error } = await supabase
      .from("users")
      .insert([{ email }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro em /users:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   CREATE TRACKING
========================= */
app.post("/trackings", async (req, res) => {
  try {
    const { user_id, tracking_code } = req.body;

    if (!user_id || !tracking_code) {
      return res.status(400).json({ error: "Dados obrigatórios" });
    }



    
    const { count } = await supabase
      .from("trackings")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user_id)
      .eq("status", "active");

    if (count >= 1) {
      return res.status(403).json({
        error: "Plano gratuito permite apenas 1 monitoramento ativo"
      });
    }

    const { data, error } = await supabase
      .from("trackings")
      .insert([{ user_id, tracking_code }])
      .select()
      .single();

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro em /trackings:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});


/* =========================
   LIST TRACKINGS
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from("trackings")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro em GET /trackings:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});



/* =========================
   RUN MONITOR (JOB)
========================= */
app.post("/run-monitor", async (req, res) => {
  console.log("▶ /run-monitor acionado");

  try {
    await rodarMonitoramento();
    console.log("✔ Monitoramento executado com sucesso");
  } catch (err) {
    console.error("❌ Erro no monitoramento:", err);
  }

  // SEMPRE responde 200 no MVP
  res.json({ status: "Monitoramento executado" });
});

/* =========================
   START SERVER
========================= */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Guardião API rodando na porta ${PORT}`);
});


app.post("/events", async (req, res) => {
  const { type, payload } = req.body;

  await supabase.from("events").insert([{
    type,
    payload
  }]);

  res.json({ ok: true });
});


/* =========================
   LIST TRACKINGS
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  try {
    const { user_id } = req.params;

    const { data, error } = await supabase
      .from("trackings")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: false });

    if (error) {
      return res.status(400).json({ error: error.message });
    }

    res.json(data);
  } catch (err) {
    console.error("Erro em GET /trackings:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});
