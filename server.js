const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const { MercadoPagoConfig, Preference } = require("mercadopago");
require("dotenv").config();
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
      "INSERT INTO play.users (nombre,email) VALUES ($1,$2) RETURNING id",
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
      .from("users")
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
      .from("users")
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
    } = req.body

    /* BUSCAR WALLET */

    const existe =
    await pool.query(

      `
      SELECT user_id
      FROM play.wallets
      WHERE user_id = $1
      `,

      [user_id]

    )

    /* SI NO EXISTE -> CREAR */

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

      )

    }
    /* RECARGAR */

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

    )

    res.json({

      ok:true,

      saldo:
      result.rows[0].saldo

    })

  }catch(err){

    console.error(err)

    res.status(500).json({

      error:"Error servidor"

    })

  }

})
// ===============================
// PAGAR
// ===============================
app.post("/pagar", async (req, res) => {

const { user_id, monto, carrito, staff_id } = req.body
const client = await pool.connect()

try{

await client.query("BEGIN")

// 🔥 VALIDACIONES BÁSICAS
if(!user_id || !monto){
  throw new Error("Datos incompletos")
}

if(!Array.isArray(carrito) || carrito.length === 0){
  throw new Error("Carrito vacío")
}

if(!staff_id){
  throw new Error("Staff no identificado")
}

// 🔥 VALIDAR SALDO
const result = await client.query(
  "SELECT saldo FROM play.wallets WHERE user_id=$1",
  [user_id]
)

if(result.rows.length === 0){
  throw new Error("Usuario no encontrado")
}

const saldo = parseFloat(result.rows[0].saldo)

if(saldo < monto){
  throw new Error("Saldo insuficiente")
}

// 🔥 OBTENER CAJA Y TERMINAL DESDE USER (STAFF)
const staff = await client.query(
  "SELECT caja_id, terminal_id FROM play.users WHERE id = $1",
  [staff_id]
)

if(staff.rows.length === 0){
  throw new Error("Staff no encontrado")
}

const caja_id = staff.rows[0].caja_id
const terminal_id = staff.rows[0].terminal_id
const evento_id = 1

// 🔥 DESCONTAR SALDO
await client.query(
  "UPDATE play.wallets SET saldo = saldo - $1 WHERE user_id=$2",
  [monto,user_id]
)

// 🔥 INSERT TRANSACCIÓN (YA CON TODO)
const transaccion = await client.query(`
INSERT INTO play.transacciones 
(user_id,monto,tipo,evento_id,caja_id,terminal_id,staff_id)
VALUES ($1,$2,'pago',$3,$4,$5,$6)
RETURNING id
`, [user_id, monto, evento_id, caja_id, terminal_id,staff_id])

const transaccion_id = transaccion.rows[0].id

// 🔥 INSERT DETALLE
for(const item of carrito){

await client.query(`
INSERT INTO play.detalle_ventas
(transaccion_id, producto_id, cantidad, precio_unitario, subtotal)
VALUES ($1,$2,$3,$4,$5)
`, [
  transaccion_id,
  item.producto_id || 1, // temporal si algo falla
  item.cantidad,
  item.precio,
  item.precio * item.cantidad
])

}

await client.query("COMMIT")

res.json({mensaje:"Pago realizado"})

}catch(err){

await client.query("ROLLBACK")

console.error("ERROR PAGO:", err.message)

res.status(500).json({error:err.message})

}finally{
client.release()
}

})

// ===============================
// CONSULTAR
// ===============================
app.get("/usuario/:user_id", async (req, res) => {

  try{

    const user_id = parseInt(req.params.user_id);

    // CLOUD (Vercel)
    if(process.env.VERCEL){

      const { data, error } = await supabase
        .from("wallets")
        .select(`
          user_id,
          desc_dispositivo,
          saldo
        `)
        .eq("user_id", user_id)
        .single();

      if(error || !data){

        return res.status(404).json({
          mensaje:"Usuario no encontrado"
        });

      }

      return res.json(data);

    }

    // LOCAL
    const user = await pool.query(
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

    res.json(user.rows[0]);

  }catch(err){

    console.error(
      "USUARIO ERROR:",
      err
    );

    res.status(500).json({
      error: err.message
    });

  }

});


// RECARGA 

/* ===================================================== */
/* MERCADO PAGO - CREAR PREFERENCIA DE RECARGA */
/* ===================================================== */
app.post("/crear-recarga-mp", async (req, res) => {

  const { user_id, monto } = req.body;

  /* VALIDAR DATOS */

  if (!user_id || !monto) {

    return res.status(400).json({
      error: "Datos incompletos"
    });

  }

  try {

    /* URLS SEGÚN ENTORNO */

    const BASE_URL =
      process.env.VERCEL
        ? "https://cashlessplay.vercel.app"   // CLOUD
        : "http://localhost:3000";            // LOCAL

    /* PREFERENCIA MP */

    const preference = {

      items: [
        {
          title: "Recarga Cashless",
          quantity: 1,
          unit_price: Number(monto),
          currency_id: "MXN"
        }
      ],

      external_reference:
        `recarga_${user_id}_${Date.now()}`,

      metadata: {
        user_id,
        tipo: "recarga_cashless"
      },

      back_urls: {

        success:
          `${BASE_URL}/pago-exitoso`,

        failure:
          `${BASE_URL}/pago-fallido`,

        pending:
          `${BASE_URL}/pago-pendiente`

      }

      // auto_return: "approved"

    };

    const preferenceClient =
      new Preference(client);

    const response =
      await preferenceClient.create({
        body: preference
      });

    res.json({
      init_point: response.init_point
    });

  } catch (error) {

    console.error(
      "MP ERROR:",
      error
    );

    res.status(500).json({
      error:
      "Error creando preferencia de pago"
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
        .from("users")
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