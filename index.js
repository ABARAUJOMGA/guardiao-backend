import express from "express";
import cors from "cors";
import { rodarMonitoramento } from "./monitor.js";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIG
========================= */
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

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
});

/* =========================
   CREATE TRACKING
========================= */
app.post("/trackings", async (req, res) => {
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
    .insert([
      {
        user_id,
        tracking_code
      }
    ])
    .select()
    .single();

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

/* =========================
   LIST TRACKINGS
========================= */
app.get("/trackings/:user_id", async (req, res) => {
  const { user_id } = req.params;

  const { data, error } = await supabase
    .from("trackings")
    .select("*")
    .eq("user_id", user_id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json(data);
});

/* =========================
   REMOVE TRACKING
========================= */
app.delete("/trackings/:id", async (req, res) => {
  const { id } = req.params;

  const { error } = await supabase
    .from("trackings")
    .delete()
    .eq("id", id);

  if (error) {
    return res.status(400).json({ error: error.message });
  }

  res.json({ success: true });
});

/* =========================
   START SERVER
========================= */
app.post("/run-monitor", async (req, res) => {
  try {
    await rodarMonitoramento();
    res.json({ status: "Monitoramento executado" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Guardião API rodando na porta ${PORT}`);
});
