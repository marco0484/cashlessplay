const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const path = require("path");
const {
  MercadoPagoConfig,
  Preference,
  Payment
} = require("mercadopago");

require("dotenv").config();
const app = express();

/* CATÁLOGO DE PRODUCTOS */

const PRODUCTOS = {
  1: { nombre: "Cerveza", precio: 50 },
  2: { nombre: "Trago", precio: 150 },
  3: { nombre: "Six", precio: 300 },
  4: { nombre: "Maruchan", precio: 45 },
  5: { nombre: "Agua", precio: 25 },
  6: { nombre: "Electrolit", precio: 50 },
  7: { nombre: "Cigarro", precio: 10 },
  8: { nombre: "Chela DJ", precio: 0 },
  9: { nombre: "Pulque", precio: 80 }
};

app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook-stripe") {
    next();
  } 
  else {
    express.json()(req, res, next);
  }
});

/* SUPABASE */

const { createClient } = require("@supabase/supabase-js");
const SUPABASE_URL = "https://caoqqzzwwpiivmqqeigw.supabase.co";
const SUPABASE_KEY = "sb_publishable_4FaRj7XuzifYgPa8BjtO8A_C46t5q0Q";

const supabase =
createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

// Mercado
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_TOKEN
});

app.use(express.static(path.join(__dirname,"public")))
app.get("/",(req,res)=>{
    res.sendFile(path.join(__dirname,"public","index.html"))
})

// Stripe

const Stripe =
  require("stripe");

const stripe =
  new Stripe(
    process.env.STRIPE_SECRET_KEY
  );

  const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

const pool = new Pool({

  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: Number(process.env.DB_PORT || 5432)
});

/* REGISTRO */

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
      return res.status(401).json({
        mensaje:"Credenciales incorrectas"
      });

    }

    res.json({
      staff_id: data.id,
      nombre: data.nombre
    });

  }catch(err){

    res.status(500).json({
      error: err.message
    });

  }

});

// ===============================
// RECARGAR
// ===============================

app.post("/recargar", async (req, res) => {

  try {

    const {
      user_id,
      monto,
      staff_id
    } = req.body;


    const usuarioId =
      Number(user_id);

    const montoRecarga =
      Number(monto);

    const staffId =
      Number(staff_id);


    /* ========================= */
    /* VALIDACIONES */
    /* ========================= */

    if(
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ){

      return res.status(400).json({
        mensaje:
          "Usuario inválido"
      });

    }


    if(
      !Number.isFinite(montoRecarga) ||
      montoRecarga <= 0
    ){

      return res.status(400).json({
        mensaje:
          "Monto inválido"
      });

    }


    if(
      !Number.isInteger(staffId) ||
      staffId <= 0
    ){

      return res.status(400).json({
        mensaje:
          "Staff inválido"
      });

    }


    /* ========================= */
    /* CLOUD / SUPABASE */
    /* ========================= */

    if(process.env.VERCEL){

      const {
        data,
        error
      } = await supabase.rpc(
        "procesar_recarga_cashless",
        {

          p_user_id:
            usuarioId,

          p_staff_id:
            staffId,

          p_monto:
            montoRecarga

        }
      );


      if(error){

        console.error(
          "RPC RECARGA ERROR:",
          error
        );


        if(
          error.message
            ?.includes(
              "Wallet no encontrada"
            )
        ){

          return res
            .status(404)
            .json({
              mensaje:
                "Wallet no encontrada"
            });

        }


        throw error;

      }


      return res.json({

        ok: true,

        mensaje:
          "Recarga realizada correctamente",

        monto:
          Number(data.monto),

        saldo:
          Number(data.saldo),

        transaccion_id:
          data.transaccion_id

      });

    }


    /* ========================= */
    /* LOCAL */
    /* ========================= */

    const clientDB =
      await pool.connect();


    try {

      await clientDB.query(
        "BEGIN"
      );


      const walletResult =
        await clientDB.query(
          `
          SELECT saldo
          FROM play.wallets
          WHERE user_id = $1
          FOR UPDATE
          `,
          [usuarioId]
        );


      if(
        walletResult.rows.length === 0
      ){

        throw new Error(
          "Wallet no encontrada"
        );

      }


      const result =
        await clientDB.query(
          `
          UPDATE play.wallets
          SET
            saldo = saldo + $1,
            actualizado =
              CURRENT_TIMESTAMP
          WHERE user_id = $2
          RETURNING saldo
          `,
          [
            montoRecarga,
            usuarioId
          ]
        );


      const trx =
        await clientDB.query(
          `
          INSERT INTO play.transacciones
          (
            user_id,
            monto,
            tipo,
            staff_id
          )
          VALUES
          (
            $1,
            $2,
            'RECARGA',
            $3
          )
          RETURNING id
          `,
          [
            usuarioId,
            montoRecarga,
            staffId
          ]
        );


      await clientDB.query(
        "COMMIT"
      );


      return res.json({

        ok: true,

        mensaje:
          "Recarga realizada correctamente",

        monto:
          montoRecarga,

        saldo:
          Number(
            result.rows[0].saldo
          ),

        transaccion_id:
          trx.rows[0].id

      });


    } catch(error){

      await clientDB.query(
        "ROLLBACK"
      );

      throw error;


    } finally {

      clientDB.release();

    }


  } catch(err){

    console.error(
      "RECARGA ERROR:",
      err
    );


    if(
      err.message
        ?.includes(
          "Wallet no encontrada"
        )
    ){

      return res
        .status(404)
        .json({
          mensaje:
            "Wallet no encontrada"
        });

    }


    return res.status(500).json({

      mensaje:
        "No fue posible realizar la recarga",

      error:
        err.message

    });

  }

});

// PAGAR

app.post("/pagar", async (req, res) => {

  try {

    const {
      user_id,
      carrito,
      staff_id
    } = req.body;


    /* ========================= */
    /* VALIDACIONES */
    /* ========================= */

    const usuarioId = Number(user_id);
    const staffId = Number(staff_id);


    if(
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ){
      return res.status(400).json({
        mensaje: "Usuario inválido"
      });
    }


    if(
      !Number.isInteger(staffId) ||
      staffId <= 0
    ){
      return res.status(400).json({
        mensaje: "Staff inválido"
      });
    }


    if(
      !Array.isArray(carrito) ||
      carrito.length === 0
    ){
      return res.status(400).json({
        mensaje: "Carrito vacío"
      });
    }


    /* ========================= */
    /* CALCULAR PRECIOS EN SERVER */
    /* ========================= */

    const detalles = [];

    let monto = 0;


    for(const item of carrito){
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad);
      const producto = PRODUCTOS[productoId];

      if(!producto){

        return res.status(400).json({
          mensaje:
            `Producto inválido: ${productoId}`
        });

      }


      if(
        !Number.isInteger(cantidad) ||
        cantidad <= 0 ||
        cantidad > 100
      ){

        return res.status(400).json({
          mensaje:
            `Cantidad inválida para ${producto.nombre}`
        });

      }


      const subtotal =
        producto.precio * cantidad;


      monto += subtotal;


      detalles.push({

        producto_id: productoId,

        cantidad,

        precio_unitario:
          producto.precio,

        subtotal

      });

    }


    if(monto < 0){

      return res.status(400).json({
        mensaje: "Monto inválido"
      });

    }


    /* ========================= */
/* PROCESAR VENTA ATÓMICA */
/* ========================= */

const {
  data,
  error
} = await supabase.rpc(
  "procesar_venta_cashless",
  {

    p_user_id:
      usuarioId,

    p_staff_id:
      staffId,

    p_monto:
      monto,

    p_detalles:
      detalles

  }
);


if(error){

  console.error(
    "RPC VENTA ERROR:",
    error
  );


  if(
    error.message
      ?.includes("Saldo insuficiente")
  ){

    return res.status(400).json({
      mensaje: "Saldo insuficiente"
    });

  }


  if(
    error.message
      ?.includes("Wallet no encontrada")
  ){

    return res.status(404).json({
      mensaje: "Wallet no encontrada"
    });

  }


  throw error;

}


/* ========================= */
/* RESPUESTA */
/* ========================= */

return res.json({

  ok: true,

  mensaje:
    "Pago realizado correctamente",

  total:
    Number(data.monto),

  saldo:
    Number(data.saldo),

  transaccion_id:
    data.transaccion_id

});

  } catch(err) {

    console.error(
      "PAGO ERROR:",
      err
    );

    return res.status(500).json({

      mensaje:
        "No fue posible procesar la venta",

      error:
        err.message

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
      monto,
      staff_id
    } = req.body;


    const usuarioId =
      Number(user_id);

    const montoRecarga =
      Number(monto);

    const staffId =
      Number(staff_id);


    if(
      !Number.isInteger(usuarioId) ||
      usuarioId <= 0
    ){

      return res.status(400).json({
        mensaje: "Usuario inválido"
      });

    }


    if(
      !Number.isFinite(montoRecarga) ||
      montoRecarga <= 0
    ){

      return res.status(400).json({
        mensaje: "Monto inválido"
      });

    }


    if(
      !Number.isInteger(staffId) ||
      staffId <= 0
    ){

      return res.status(400).json({
        mensaje: "Staff inválido"
      });

    }


    const preference =
      new Preference(client);


    const result =
      await preference.create({

        body: {

          items: [
            {

              title:
                `Recarga Cashless Usuario ${usuarioId}`,

              quantity: 1,

              unit_price:
                montoRecarga,

              currency_id:
                "MXN"

            }
          ],


          /*
            Guardamos usuario + staff.

            Ejemplo:
            25|3
          */

          external_reference:
            `${usuarioId}|${staffId}`,


          notification_url:
            "https://cashlessplay.vercel.app/webhook-mp",


          back_urls: {

            success:
              "https://cashlessplay.vercel.app/index.html?recarga=success",

            failure:
              "https://cashlessplay.vercel.app/index.html?recarga=failure",

            pending:
              "https://cashlessplay.vercel.app/index.html?recarga=pending"

          },


          auto_return:
            "approved"

        }

      });


    return res.json({

      ok: true,

      init_point:
        result.init_point

    });


  } catch(err) {

    console.error(
      "CREAR MP ERROR:",
      err
    );


    return res.status(500).json({

      mensaje:
        "No fue posible crear la recarga",

      error:
        err.message

    });

  }

});

//  end point stripe 

app.post(
  "/crear-recarga-stripe",
  async (req,res) => {

    try {

      const {
        user_id,
        monto,
        staff_id
      } = req.body;


      const usuarioId =
        Number(user_id);

      const montoRecarga =
        Number(monto);

      const staffId =
        Number(staff_id);


      /* ========================= */
      /* VALIDACIONES */
      /* ========================= */

      if(
        !Number.isInteger(usuarioId) ||
        usuarioId <= 0
      ){

        return res.status(400).json({
          mensaje: "Usuario inválido"
        });

      }


      if(
        !Number.isFinite(montoRecarga) ||
        montoRecarga <= 0
      ){

        return res.status(400).json({
          mensaje: "Monto inválido"
        });

      }


      if(
        !Number.isInteger(staffId) ||
        staffId <= 0
      ){

        return res.status(400).json({
          mensaje: "Staff inválido"
        });

      }


      /* ========================= */
      /* CREAR PAYMENT INTENT */
      /* ========================= */

      const paymentIntent =
        await stripe.paymentIntents.create({

          amount:
            Math.round(
              montoRecarga * 100
            ),

          currency:
            "mxn",

          metadata: {

            user_id:
              String(usuarioId),

            staff_id:
              String(staffId)

          }

        });


      return res.json({

        ok: true,

        paymentIntentId:
          paymentIntent.id,

        clientSecret:
          paymentIntent.client_secret

      });


    } catch(err) {

      console.error(
        "STRIPE CREATE ERROR:",
        err
      );


      return res.status(500).json({

        mensaje:
          "No fue posible crear el pago",

        error:
          err.message

      });

    }

  }
);
/* HISTORIAL */

app.get("/historial", async (req, res) => {

  try{

const { data: transacciones, error: trxError } =
await supabase
  .from("cash_transacciones")
  .select("*")
  .order("creado",{
    ascending:false
  });

if(trxError){
  throw trxError;
}

const staffIds = [
  ...new Set(
    (transacciones || [])
      .map(t => Number(t.staff_id))
      .filter(id => !isNaN(id))
  )
];

let staffMap = {};

if(staffIds.length){

  const { data: staffs, error: staffError } =
  await supabase
    .from("cash_users")
    .select("id,nombre")
    .in("id", staffIds);

  if(staffError){
    throw staffError;
  }

  staffMap = Object.fromEntries(
    staffs.map(s => [
      Number(s.id),
      s.nombre
    ])
  );

}

const historial =
(transacciones || []).map(t => ({

  ...t,

  staff_nombre:
    staffMap[
      Number(t.staff_id)
    ] || null

}));

return res.json(historial);

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

  const { data: wallets, error: walletsError } =
  await supabase
    .from("cash_wallets")
    .select("saldo");

  if(walletsError) throw walletsError;

  const { data: ventas, error: ventasError } =
  await supabase
    .from("cash_transacciones")
    .select("monto")
    .eq("tipo","VENTA");

  if(ventasError) throw ventasError;

  const { data: recargas, error: recargasError } =
  await supabase
    .from("cash_transacciones")
    .select("monto")
    .eq("tipo","RECARGA");

  if(recargasError) throw recargasError;

  const saldoTotal =
  (wallets || []).reduce(
    (a,b)=>a+Number(b.saldo || 0),
    0
  );

  const totalVentas =
  (ventas || []).reduce(
    (a,b)=>a+Number(b.monto || 0),
    0
  );

  const totalRecargas =
  (recargas || []).reduce(
    (a,b)=>a+Number(b.monto || 0),
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
    (wallets || []).length

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
/* WEBHOOK MERCADO PAGO */
/* ===================================================== */

app.post("/webhook-mp", async (req, res) => {

  try {


    /* ========================= */
    /* IGNORAR MERCHANT ORDER */
    /* ========================= */

    if(
      req.body?.topic ===
      "merchant_order"
    ){

      return res.sendStatus(200);

    }


    /* ========================= */
    /* PAYMENT ID */
    /* ========================= */

    const paymentId =
      req.body?.data?.id ||
      req.body?.resource;


    if(!paymentId){

      return res.sendStatus(200);

    }


    /* ========================= */
    /* CONSULTAR MERCADO PAGO */
    /* ========================= */

    const payment =
      new Payment(client);


    const pago =
      await payment.get({
        id: paymentId
      });


    if(
      pago.status !==
      "approved"
    ){

      return res.sendStatus(200);

    }


    /* ========================= */
    /* USUARIO + STAFF */
    /* ========================= */

    const referencia =
      String(
        pago.external_reference || ""
      );


    const [
      userRaw,
      staffRaw
    ] =
      referencia.split("|");


    const user_id =
      Number(userRaw);

    const staff_id =
      Number(staffRaw);


    const monto =
      Number(
        pago.transaction_amount
      );


    if(
      !Number.isInteger(user_id) ||
      user_id <= 0
    ){

      console.error(
        "MP USER INVÁLIDO:",
        referencia
      );

      return res.sendStatus(200);

    }


    if(
      !Number.isInteger(staff_id) ||
      staff_id <= 0
    ){

      console.error(
        "MP STAFF INVÁLIDO:",
        referencia
      );

      return res.sendStatus(200);

    }


    if(
      !Number.isFinite(monto) ||
      monto <= 0
    ){

      console.error(
        "MP MONTO INVÁLIDO:",
        monto
      );

      return res.sendStatus(200);

    }


    /* ========================= */
    /* RECARGA ATÓMICA */
    /* ========================= */

    const {
      data,
      error
    } = await supabase.rpc(
      "procesar_recarga_mp",
      {

        p_user_id:
          user_id,

        p_staff_id:
          staff_id,

        p_monto:
          monto,

        p_mp_payment_id:
          String(pago.id)

      }
    );


    if(error){

      console.error(
        "RPC MP ERROR:",
        error
      );

      return res.sendStatus(500);

    }


    /* ========================= */
    /* WEBHOOK REPETIDO */
    /* ========================= */

    if(data?.duplicado){

      console.log(
        "MP YA PROCESADO:",
        pago.id
      );

      return res.sendStatus(200);

    }


    console.log(
      "✅ RECARGA MP:",
      {
        payment_id:
          pago.id,

        user_id,

        staff_id,

        monto,

        saldo:
          data?.saldo
      }
    );


    return res.sendStatus(200);


  } catch(err) {

    console.error(
      "WEBHOOK MP ERROR:",
      err
    );

    return res.sendStatus(500);

  }

});

// Stripe

app.get(
  "/stripe-test",
  async (req,res)=>{

    res.json({
      ok:true
    });

});
app.post(
  "/webhook-stripe",

  express.raw({
    type: "*/*"
  }),

  async (req,res) => {

    const sig =
      req.headers[
        "stripe-signature"
      ];


    try {


      /* ========================= */
      /* VALIDAR FIRMA STRIPE */
      /* ========================= */

      const event =
        stripe.webhooks.constructEvent(
          req.body,
          sig,
          endpointSecret
        );


      /* ========================= */
      /* SOLO PAGOS EXITOSOS */
      /* ========================= */

      if(
        event.type !==
        "payment_intent.succeeded"
      ){

        return res.json({
          received: true
        });

      }


      const paymentIntent =
        event.data.object;


      /* ========================= */
      /* DATOS DEL PAGO */
      /* ========================= */

      const stripePaymentId =
        paymentIntent.id;


      const user_id =
        Number(
          paymentIntent
            .metadata
            .user_id
        );


      const staff_id =
        Number(
          paymentIntent
            .metadata
            .staff_id
        );


      const monto =
        Number(
          paymentIntent.amount
        ) / 100;


      /* ========================= */
      /* VALIDACIONES */
      /* ========================= */

      if(
        !Number.isInteger(user_id) ||
        user_id <= 0
      ){

        console.error(
          "STRIPE USER INVÁLIDO:",
          user_id
        );

        return res.sendStatus(200);

      }


      if(
        !Number.isInteger(staff_id) ||
        staff_id <= 0
      ){

        console.error(
          "STRIPE STAFF INVÁLIDO:",
          staff_id
        );

        return res.sendStatus(200);

      }


      if(
        !Number.isFinite(monto) ||
        monto <= 0
      ){

        console.error(
          "STRIPE MONTO INVÁLIDO:",
          monto
        );

        return res.sendStatus(200);

      }


      /* ========================= */
      /* RECARGA ATÓMICA */
      /* ========================= */

      const {
        data,
        error
      } = await supabase.rpc(
        "procesar_recarga_stripe",
        {

          p_user_id:
            user_id,

          p_staff_id:
            staff_id,

          p_monto:
            monto,

          p_stripe_payment_id:
            stripePaymentId

        }
      );


      if(error){

        console.error(
          "RPC STRIPE ERROR:",
          error
        );

        return res.sendStatus(500);

      }


      /* ========================= */
      /* WEBHOOK DUPLICADO */
      /* ========================= */

      if(data?.duplicado){

        console.log(
          "STRIPE YA PROCESADO:",
          stripePaymentId
        );

        return res.sendStatus(200);

      }


      console.log(
        "✅ RECARGA STRIPE:",
        {
          stripe_payment_id:
            stripePaymentId,
          user_id,
          staff_id,
          monto,
          saldo:
            data?.saldo
        }
      );


      return res.json({
        received: true
      });


    } catch(err) {

      console.error(
        "WEBHOOK STRIPE ERROR:",
        err
      );


      return res.status(400).send(
        "Webhook Stripe inválido"
      );

    }

  }
);


/* PRODUCTOS MÁS CONSUMIDOS */
app.get("/productos-top", async (req, res) => {
  try{
  

    if(process.env.VERCEL){
      const { data, error } = await supabase
        .from("cash_detalle_ventas")
        .select("producto_id,cantidad,subtotal");

      if(error){
        throw error;
      }

      const resumen = {};

      data.forEach(item => {
        const id = Number(item.producto_id);

        if(!resumen[id]){
          resumen[id] = {
            producto_id:id,
          nombre: PRODUCTOS[id]?.nombre || `Producto ${id}`,
            total:0,
            ingresos:0
          };
        }

        resumen[id].total += Number(item.cantidad || 0);
        resumen[id].ingresos += Number(item.subtotal || 0);
      });

      const resultado = Object.values(resumen)
        .sort((a,b) => b.total - a.total)
        .slice(0,10);

      return res.json(resultado);
    }

    const result = await pool.query(`
      SELECT
        producto_id,
        SUM(cantidad) total,
        SUM(subtotal) ingresos
      FROM cash_detalle_ventas
      GROUP BY producto_id
      ORDER BY total DESC
      LIMIT 10
    `);

const resultado = result.rows.map(item => {
  const id = Number(item.producto_id);

  return {
    producto_id: id,

    nombre:
      PRODUCTOS[id]?.nombre ||
      `Producto ${id}`,

    total:
      Number(item.total || 0),

    ingresos:
      Number(item.ingresos || 0)
  };
});

    res.json(resultado);

  }catch(err){
    console.error("PRODUCTOS TOP ERROR:", err);
    res.status(500).json({
      error:err.message
    });
  }
});

/* INICIAR SERVIDOR LOCAL */
/* EN VERCEL APP.LISTEN SE IGNORA */
app.listen(3000, () => {
  console.log(
    "Servidor corriendo 🚀"
  );
});