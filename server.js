const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const { MercadoPagoConfig, Preference } = require("mercadopago");
require("dotenv").config();
console.log("MP TOKEN =", process.env.MP_TOKEN);
const app = express();

app.use(cors());
app.use(express.json());

/* ========================= */
/* SUPABASE */
/* ========================= */

const { createClient } =
require("@supabase/supabase-js");

const SUPABASE_URL =
  "https://caoqqzzwwpiivmqqeigw.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_4FaRj7XuzifYgPa8BjtO8A_C46t5q0Q";

const supabase =
createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_TOKEN
});

app.use(express.static(path.join(__dirname,"public")))
app.get("/",(req,res)=>{
  res.sendFile(path.join(__dirname,"public","pos.html"))
})

// DB
const pool = new Pool({

  user:"postgres",
  host:"localhost",
  database:"postgres",
  password:"Unitec88",
  port:5432

})

// ===============================
// REGISTRO
// ===============================
app.post("/registro",async(req,res)=>{
  const {nombre,email}=req.body

  try{
    const user = await pool.query(
      "INSERT INTO cash_users (nombre,email) VALUES ($1,$2) RETURNING id",
      [nombre,email]
    )

    const user_id = user.rows[0].id

    await pool.query(
      "INSERT INTO play.wallets (user_id,saldo) VALUES ($1,0)",
      [user_id]
    )

    res.json({mensaje:"Usuario creado", user_id})

  }catch(err){
    console.error(err)
    res.status(500).json({error:err.message})
  }
})

// ===============================
// LOGIN STAFF
// ===============================
/*app.post("/login", async (req, res) => {

  const nombre = req.body.nombre;
  const pin = parseInt(req.body.pin);

  if(!nombre || !pin){

    return res.status(400).json({
      mensaje:"Datos incompletos"
    });

  }

  try{

    const { data, error } = await supabase
      .from("cash_users")
      .select("id,nombre")
      .eq("nombre", nombre)
      .eq("pin", pin)
      .single();

    if(error || !data){

      return res.status(401).json({
        mensaje:"Credenciales incorrectas"
      });

    }

    res.json({
      staff_id: data.id,
      nombre: data.nombre
    });

  }catch(err){

    console.error(
      "LOGIN ERROR:",
      err.message
    );

    res.status(500).json({
      error:"Error en login"
    });

  }

});

*/

// LOGIN EXPERIMENTO 

app.post("/login", async (req, res) => {

  const nombre = req.body.nombre;
  const pin = parseInt(req.body.pin);

  if(!nombre || !pin){

    return res.status(400).json({
      mensaje:"Datos incompletos"
    });

  }

  try{

    const { data, error } = await supabase
      .from("cash_users")
      .select("id,nombre")
      .eq("nombre", nombre)
      .eq("pin", pin)
      .single();

    if(error){

      console.error("SUPABASE ERROR:", error);

      return res.status(401).json({
        mensaje:"Credenciales incorrectas"
      });

    }

    res.json({
      staff_id: data.id,
      nombre: data.nombre
    });

  }catch(err){

    console.error(
      "LOGIN ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  }

});

// ===============================
// RECARGAR
// ===============================
app.post("/recargar", async (req, res) => {

  try{

    const {
      user_id,
      monto
    } = req.body;

    /* ========================= */
    /* CLOUD - SUPABASE */
    /* ========================= */

    if(process.env.VERCEL){

      const { data: wallet } =
      await supabase
        .from("cash_wallets")
        .select("user_id,saldo")
        .eq("user_id", user_id)
        .single();

      /* SI NO EXISTE */

      if(!wallet){

        await supabase
          .from("cash_wallets")
          .insert([{
            user_id,
            saldo: 0
          }]);

      }

      /* OBTENER SALDO ACTUAL */

      const { data: actual } =
      await supabase
        .from("cash_wallets")
        .select("saldo")
        .eq("user_id", user_id)
        .single();

      const nuevoSaldo =
        Number(actual?.saldo || 0)
        + Number(monto);

      /* ACTUALIZAR */

      const { error } =
      await supabase
        .from("cash_wallets")
        .update({

          saldo: nuevoSaldo,
          actualizado:
          new Date().toISOString()

        })
        .eq("user_id", user_id);

      if(error){

        throw error;

      }

      await supabase
  .from("cash_transacciones")
  .insert({
    user_id,
    monto,
    tipo:"RECARGA"
  });


      return res.json({

        ok:true,
        saldo:nuevoSaldo

      });

    }

    /* ========================= */
    /* LOCAL - POSTGRES */
    /* ========================= */

    const existe =
    await pool.query(

      `
      SELECT user_id
      FROM play.wallets
      WHERE user_id = $1
      `,

      [user_id]

    );

    if(existe.rowCount === 0){

      await pool.query(

        `
        INSERT INTO play.wallets
        (
          user_id,
          saldo
        )
        VALUES
        ($1,0)
        `,

        [user_id]

      );

    }

    const result =
    await pool.query(

      `
      UPDATE play.wallets
      SET
        saldo = saldo + $1,
        actualizado = CURRENT_TIMESTAMP
      WHERE user_id = $2
      RETURNING saldo
      `,

      [
        monto,
        user_id
      ]

    );

    await pool.query(
`
INSERT INTO play.transacciones
(
  user_id,
  monto,
  tipo
)
VALUES
(
  $1,
  $2,
  'RECARGA'
)
`,
[
  user_id,
  monto
]
);

    res.json({

      ok:true,

      saldo:
      result.rows[0].saldo

    });

  }catch(err){

    console.error(
      "RECARGA ERROR:",
      err
    );

    res.status(500).json({

      error:"Error servidor"

    });

  }

});

// ===============================
// CONSULTAR
// ===============================
app.get("/usuario/:user_id", async (req, res) => {

  try{

    const user_id =
      parseInt(req.params.user_id);

    if(isNaN(user_id)){

      return res.status(400).json({
        mensaje:"ID inválido"
      });

    }

    if(process.env.VERCEL){

      const { data, error } =
      await supabase
        .from("cash_wallets")
        .select(
          "user_id,desc_dispositivo,saldo"
        )
        .eq("user_id", user_id)
        .single();

      if(error || !data){

        return res.status(404).json({
          mensaje:"Usuario no encontrado"
        });

      }

      return res.json(data);

    }

    const user =
    await pool.query(
      `
      SELECT
        user_id,
        desc_dispositivo,
        saldo
      FROM play.wallets
      WHERE user_id = $1
      `,
      [user_id]
    );

    if(user.rows.length === 0){

      return res.status(404).json({
        mensaje:"Usuario no encontrado"
      });

    }

    return res.json(user.rows[0]);

  }catch(err){

    console.error(
      "USUARIO ERROR:",
      err
    );

    return res.status(500).json({
      error: err.message
    });

  }

});


/* ===================================================== */
/* MERCADO PAGO RECARGA */
/* ===================================================== */

app.post("/crear-recarga-mp", async (req, res) => {

  try {

    const {
      user_id,
      monto
    } = req.body;

    if (!user_id || !monto) {

      return res.status(400).json({
        error: "Datos incompletos"
      });

    }

console.log(
  "TOKEN:",
  process.env.MP_TOKEN?.substring(0,20)
);

    const preference = new Preference(client);

    const result =
    await preference.create({

      body: {

        items: [

          {

            title:
            `Recarga Cashless Usuario ${user_id}`,

            quantity: 1,

            unit_price:
            Number(monto),

            currency_id: "MXN"

          }

        ],

        external_reference:
        String(user_id),

        back_urls: {
  success: "https://cashlessplay.vercel.app",
  failure: "https://cashlessplay.vercel.app",
  pending: "https://cashlessplay.vercel.app"
},

        auto_return:
        "approved"

      }

    });

    res.json({

      init_point:
      result.init_point

    });

  } catch(err) {

    console.error(
      "MP ERROR:",
      err
    );

    res.status(500).json({

      error:
      err.message

    });

  }

});
/* ===================================================== */
/* HISTORIAL */
/* ===================================================== */
app.get("/historial", async (req, res) => {

  try{

    if(process.env.VERCEL){

      const { data, error } =
      await supabase
        .from("cash_transacciones")
        .select("*")
        .order("creado", {
          ascending:false
        });

      if(error){
        throw error;
      }

      return res.json(data);

    }

    const result =
    await pool.query(`
      SELECT
        id,
        user_id,
        monto,
        tipo,
        staff_id,
        creado
      FROM play.transacciones
      ORDER BY creado DESC
    `);

    res.json(result.rows);

  }catch(err){

    console.error(
      "HISTORIAL ERROR:",
      err
    );

    res.status(500).json({
      error:err.message
    });

  }

});

/* ===================================================== */
/* DASHBOARD */
/* ===================================================== */
app.get("/dashboard", async (req, res) => {

  try{

    if(process.env.VERCEL){

      const { data: wallets } =
      await supabase
        .from("cash_wallets")
        .select("saldo");

      const { data: ventas } =
      await supabase
        .from("cash_transacciones")
        .select("monto")
        .eq("tipo","VENTA");

      const { data: recargas } =
      await supabase
        .from("cash_transacciones")
        .select("monto")
        .eq("tipo","RECARGA");

      const saldoTotal =
      wallets.reduce(
        (a,b)=>a+Number(b.saldo),
        0
      );

      const totalVentas =
      ventas.reduce(
        (a,b)=>a+Number(b.monto),
        0
      );

      const totalRecargas =
      recargas.reduce(
        (a,b)=>a+Number(b.monto),
        0
      );

      return res.json({

        saldo_total:
        saldoTotal,

        ventas_total:
        totalVentas,

        recargas_total:
        totalRecargas,

        usuarios:
        wallets.length

      });

    }

    const saldo =
    await pool.query(`
      SELECT
      COALESCE(
      SUM(saldo),0
      ) total
      FROM play.wallets
    `);

    const ventas =
    await pool.query(`
      SELECT
      COALESCE(
      SUM(monto),0
      ) total
      FROM play.transacciones
      WHERE tipo='VENTA'
    `);

    const recargas =
    await pool.query(`
      SELECT
      COALESCE(
      SUM(monto),0
      ) total
      FROM play.transacciones
      WHERE tipo='RECARGA'
    `);

    const usuarios =
    await pool.query(`
      SELECT COUNT(*)
      total
      FROM play.wallets
    `);

    res.json({

      saldo_total:
      saldo.rows[0].total,

      ventas_total:
      ventas.rows[0].total,

      recargas_total:
      recargas.rows[0].total,

      usuarios:
      usuarios.rows[0].total

    });

  }catch(err){

    console.error(
      "DASHBOARD ERROR:",
      err
    );

    res.status(500).json({
      error:err.message
    });

  }

});

/* ===================================================== */
/* TEST SUPABASE */
/* SOLO PARA VALIDAR CONECTIVIDAD */
/* ===================================================== */
app.get("/test-supabase", async (req, res) => {

  try {

    const { data, error } =
      await supabase
        .from("cash_users")
        .select("*")
        .limit(1);

    if (error) {

      console.error(
        "SUPABASE ERROR:",
        error
      );

      return res.status(500)
        .json(error);

    }

    res.json(data);

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});


/* ===================================================== */
/* INICIAR SERVIDOR LOCAL */
/* EN VERCEL APP.LISTEN SE IGNORA */
/* ===================================================== */
app.listen(3000, () => {

  console.log(
    "Servidor corriendo 🚀"
  );

});