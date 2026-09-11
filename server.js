const express      = require("express");
const cors         = require("cors");
const jwt          = require("jsonwebtoken");
const cookieParser = require("cookie-parser");
const { Pool }     = require("pg");
const path         = require("path");
const {
  MercadoPagoConfig,
  Preference,
  Payment
} = require("mercadopago");

require("dotenv").config();

console.log(
  "SESSION_SECRET configurada:",
  !!process.env.SESSION_SECRET
);

const app = express();
app.use(cookieParser());

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

const SUPABASE_SECRET_KEY = process.env.SUPABASE_SECRET_KEY;
const supabaseAdmin = createClient(SUPABASE_URL,SUPABASE_SECRET_KEY);

// Mercado
const client = new MercadoPagoConfig({
  accessToken: process.env.MP_TOKEN
});

app.use(express.static(path.join(__dirname,"public")))

function requireStaff(req, res, next) {

  const token = req.cookies.cash_session;

  if (!token) {
    return res.status(401).json({
      ok: false,
      mensaje: "Sesión no iniciada"
    });
  }

  try {

    const decoded = jwt.verify(
      token,
      process.env.SESSION_SECRET
    );

    req.staff = decoded;

    next();

  } catch (error) {

    return res.status(401).json({
      ok: false,
      mensaje: "Sesión inválida o expirada"
    });

  }
}

app.get("/sesion", requireStaff, async (req, res) => {

  try {

    const { data, error } = await supabaseAdmin
      .from("cash_users")
      .select("id,nombre")
      .eq("id", req.staff.staff_id)
      .single();

    if(error || !data){

      return res.status(401).json({
        ok: false,
        mensaje: "Staff no válido"
      });

    }

    res.json({
      ok: true,
      staff_id: data.id,
      nombre: data.nombre
    });

  } catch(error) {

    console.error("❌ ERROR SESION:", error);

    res.status(500).json({
      ok: false,
      mensaje: "Error verificando sesión"
    });

  }

});


app.get("/",(req,res)=>{res.sendFile(path.join(__dirname,"public","index.html"))})

// Stripe

const Stripe = require("stripe");
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  if (!nombre || !pin) {

    return res.status(400).json({
      mensaje: "Datos incompletos"
    });

  }

  try {

    const { data, error } = await supabaseAdmin
      .from("cash_users")
      .select("id,nombre")
      .eq("nombre", nombre)
      .eq("pin", pin)
      .single();

    if (error || !data) {

      return res.status(401).json({
        mensaje: "Credenciales incorrectas"
      });

    }

    // ==========================================
    // CREAR SESIÓN SEGURA
    // ==========================================

    const token = jwt.sign(
      {
        staff_id: data.id
      },
      process.env.SESSION_SECRET,
      {
        expiresIn: "8h"
      }
    );

    // ==========================================
    // GUARDAR SESIÓN EN COOKIE
    // ==========================================

    res.cookie("cash_session", token, {
      httpOnly: true,
      secure: !!process.env.VERCEL,
      sameSite: "lax",
      maxAge: 8 * 60 * 60 * 1000
    });

    // ==========================================
    // RESPUESTA
    // ==========================================

    res.json({
      ok: true,
      nombre: data.nombre
    });

  } catch (err) {

    res.status(500).json({
      error: err.message
    });

  }

});

// ===============================
// RECARGAR
// ===============================

app.post("/recargar", requireStaff, async (req, res) => {
  try {

 const {
  user_id,
  monto
} = req.body;


const usuarioId    = Number(user_id);
const montoRecarga = Number(monto);
const staffId      = Number(req.staff.staff_id);


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
      } = await supabaseAdmin.rpc(
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


// ===============================
// PRODUCTOS CASHLESS
// ===============================

app.get("/cash/productos", async (req, res) => {

  const id_evento = Number(req.query.id_evento);

  if (!id_evento) {
    return res.status(400).json({
      error: "id_evento requerido"
    });
  }

  try {

    const { data, error } = await supabaseAdmin
      .from("cash_productos")
      .select("*")
      .eq("id_evento", id_evento)
      .eq("activo", true)
      .order("nombre");

    if (error) {

      console.error(
        "❌ ERROR PRODUCTOS SUPABASE:",
        error
      );

      return res.status(500).json({
        error: error.message
      });
    }

    return res.status(200).json(data || []);

  } catch (err) {

    console.error(
      "❌ ERROR PRODUCTOS:",
      err
    );

    return res.status(500).json({
      error: err.message
    });

  }

});

// ===============================
// PAGAR
// ===============================


app.post("/pagar", requireStaff, async (req,res)=>{
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


/* ========================= */
/* OBTENER PRODUCTOS REALES */
/* ========================= */

const productoIds = carrito.map(item =>
  Number(item.producto_id)
);


/* Validar IDs */

if(
  productoIds.some(id =>
    !Number.isInteger(id) || id <= 0
  )
){

  return res.status(400).json({
    mensaje: "Producto inválido"
  });

}


/* Consultar productos desde Supabase */

const {
  data: productos,
  error: productosError
} = await supabaseAdmin
  .from("cash_productos")
  .select(
    "id, nombre, precio, activo"
  )
  .in("id", productoIds)
  .eq("activo", true);


if(productosError){

  console.error(
    "PRODUCTOS ERROR:",
    productosError
  );

  throw productosError;

}


/* ========================= */
/* MAPEAR PRODUCTOS */
/* ========================= */

const productosMap = new Map(
  productos.map(producto => [
    Number(producto.id),
    producto
  ])
);


/* ========================= */
/* CALCULAR TOTAL */
/* ========================= */

for(const item of carrito){

  const productoId =
    Number(item.producto_id);

  const cantidad =
    Number(item.cantidad);


  const producto =
    productosMap.get(productoId);


  if(!producto){

    return res.status(400).json({
      mensaje:
        `Producto inválido o inactivo: ${productoId}`
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


  /* ========================= */
  /* PRECIO REAL DE SUPABASE */
  /* ========================= */

  const precio =
    Number(producto.precio);


  if(
    !Number.isFinite(precio) ||
    precio < 0
  ){

    return res.status(400).json({
      mensaje:
        `Precio inválido para ${producto.nombre}`
    });

  }


  const subtotal =
    precio * cantidad;


  monto += subtotal;


  detalles.push({
    producto_id: productoId,
    cantidad,
    precio_unitario: precio,
    subtotal
  });
}


/* ========================= */
/* VALIDAR MONTO FINAL */
/* ========================= */

if(
  !Number.isFinite(monto) ||
  monto <= 0
){

  return res.status(400).json({
    mensaje: "Monto inválido"
  });

}

const {
  data,
  error
} = await supabaseAdmin.rpc(
  "procesar_venta_cashless",
  {
    p_user_id:  usuarioId,
    p_staff_id: staffId,
    p_monto:    monto,
    p_detalles: detalles
  }
);


if(error){

  console.error( "RPC VENTA ERROR:", error);
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
  mensaje: "Pago realizado correctamente",
  total: Number(data.monto),
  saldo: Number(data.saldo),
  transaccion_id: data.transaccion_id
});

  } catch(err) {

    console.error(
      "PAGO ERROR:",
      err
    );

    return res.status(500).json({
                          mensaje: "No fue posible procesar la venta",
                          error:err.message
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
      await supabaseAdmin
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
              title: `Recarga Cashless Usuario ${usuarioId}`,
              quantity: 1,
              unit_price: montoRecarga,
              currency_id:"MXN"
            }
          ],
          external_reference: `${usuarioId}|${staffId}`,
          notification_url: "https://cashlessplay.vercel.app/webhook-mp",
          back_urls: {
            success: "https://cashlessplay.vercel.app/index.html?recarga=success",
            failure: "https://cashlessplay.vercel.app/index.html?recarga=failure",
            pending: "https://cashlessplay.vercel.app/index.html?recarga=pending"
          },
          auto_return: "approved"
        }
      });


    return res.json({
      ok: true,
      init_point:result.init_point
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


      const usuarioId    = Number(user_id);
      const montoRecarga = Number(monto);
      const staffId      = Number(staff_id);

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
          currency:"mxn",
          metadata: {
            user_id: String(usuarioId),
            staff_id: String(staffId)
          }
        });


      return res.json({
        ok: true,
        paymentIntentId:paymentIntent.id,
        clientSecret:paymentIntent.client_secret
      });


    } catch(err) {

      console.error(
        "STRIPE CREATE ERROR:",
        err
      );


      return res.status(500).json({
        mensaje: "No fue posible crear el pago",
        error: err.message
      });
    }
  }
);
/* HISTORIAL */

app.get("/historial", async (req, res) => {

  try{

const { data: transacciones, error: trxError } =
await supabaseAdmin
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
  await supabaseAdmin
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
  await supabaseAdmin
    .from("cash_wallets")
    .select("saldo");

  if(walletsError) throw walletsError;

  const { data: ventas, error: ventasError } =
  await supabaseAdmin
    .from("cash_transacciones")
    .select("monto")
    .eq("tipo","VENTA");

  if(ventasError) throw ventasError;

  const { data: recargas, error: recargasError } =
  await supabaseAdmin
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
      await supabaseAdmin
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
/* WEBHOOK MERCADO PAGO - PRODUCCION */
/* ===================================================== */

app.post("/webhook-mp", async (req, res) => {

  try {
    /* ===================================== */
    /* TIPO DE NOTIFICACION */
    /* ===================================== */

    const tipo =
      req.body?.type ||
      req.body?.topic ||
      req.query?.type ||
      req.query?.topic;


    /* ===================================== */
    /* OBTENER PAYMENT ID */
    /* ===================================== */

    let paymentId =
      req.body?.data?.id ||
      req.query?.["data.id"] ||
      req.query?.id ||
      req.body?.resource;


    /*
      Algunas notificaciones antiguas pueden
      mandar resource como URL completa.
    */

    if(
      typeof paymentId === "string" &&
      paymentId.includes("/")
    ){

      const partes =
        paymentId.split("/");

      paymentId =
        partes[partes.length - 1];

    }


    /* ===================================== */
    /* SIN PAYMENT ID */
    /* ===================================== */

    if(!paymentId){

      console.warn(
        "⚠️ MP WEBHOOK SIN PAYMENT ID"
      );

      return res.sendStatus(200);

    }

    /* ===================================== */
    /* CONSULTAR PAGO REAL EN MERCADO PAGO */
    /* ===================================== */

    const payment = new Payment(client);
    const pago = await payment.get({id: paymentId});

    /* ===================================== */
    /* USUARIO + STAFF */
    /* ===================================== */

    const referencia = String(pago.external_reference || "");

    const [userRaw,staffRaw] = referencia.split("|");

    const user_id = Number(userRaw);

    const staff_id = Number(staffRaw);

    const monto = Number(pago.transaction_amount);

    /* ===================================== */
    /* VALIDAR USUARIO */
    /* ===================================== */

    if(
      !Number.isInteger(user_id) ||
      user_id <= 0
    ){

      console.error(
        "❌ MP USER INVÁLIDO:",
        referencia
      );

      return res.sendStatus(200);

    }


    /* ===================================== */
    /* VALIDAR STAFF */
    /* ===================================== */

    if(
      !Number.isInteger(staff_id) ||
      staff_id <= 0
    ){

      console.error(
        "❌ MP STAFF INVÁLIDO:",
        referencia
      );

      return res.sendStatus(200);

    }


    /* ===================================== */
    /* VALIDAR MONTO */
    /* ===================================== */

    if(
      !Number.isFinite(monto) ||
      monto <= 0
    ){

      console.error(
        "❌ MP MONTO INVÁLIDO:",
        monto
      );

      return res.sendStatus(200);

    }


    /* ===================================== */
    /* RECARGA ATOMICA EN SUPABASE */
    /* ===================================== */

    const {
      data,
      error
    } =
      await supabaseAdmin.rpc(
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


    /* ===================================== */
    /* ERROR SUPABASE */
    /* ===================================== */

    if(error){

      console.error(
        "❌ RPC MP ERROR:",
        error
      );

      /*
        DEVOLVEMOS 500
        para que Mercado Pago pueda reintentar
      */

      return res.sendStatus(500);

    }

    /* ===================================== */
    /* OK */
    /* ===================================== */


    return res.sendStatus(200);


  } catch(err){

    console.error(
      "❌ WEBHOOK MP ERROR:",
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
      } = await supabaseAdmin.rpc(
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

  try {

    const {
      data: detalles,
      error: detallesError
    } = await supabaseAdmin
      .from("cash_detalle_ventas")
      .select("producto_id, cantidad");

    if (detallesError) {
      console.error(
        "PRODUCTOS TOP DETALLES ERROR:",
        detallesError
      );

      throw detallesError;
    }

    if (!detalles || detalles.length === 0) {
      return res.json([]);
    }


    /* ========================= */
    /* AGRUPAR CONSUMOS */
    /* ========================= */

    const agrupados = {};

    for (const item of detalles) {
      const productoId = Number(item.producto_id);
      const cantidad = Number(item.cantidad || 0);
      if (!productoId) continue;

      agrupados[productoId] =
        (agrupados[productoId] || 0) + cantidad;
    }


    /* ========================= */
    /* OBTENER PRODUCTOS */
    /* ========================= */

    const ids =
      Object.keys(agrupados)
        .map(Number);

    if (ids.length === 0) {
      return res.json([]);
    }

    const {
      data: productos,
      error: productosError
    } = await supabaseAdmin
      .from("cash_productos")
      .select("id,nombre")
      .in("id", ids);

    if (productosError) {

      console.error(
        "PRODUCTOS TOP PRODUCTOS ERROR:",
        productosError
      );

      throw productosError;
    }


    /* ========================= */
    /* ARMAR RESPUESTA */
    /* ========================= */

    const resultado =
      productos
        .map(producto => ({
          id: producto.id,
          nombre: producto.nombre,
          total:
            agrupados[Number(producto.id)] || 0
        }))
        .sort(
          (a, b) => b.total - a.total
        )
        .slice(0, 10);


    return res.json(resultado);

  } catch (err) {

    console.error(
      "PRODUCTOS TOP ERROR:",
      err
    );

    return res.status(500).json({
      mensaje:
        "No fue posible obtener productos top",
      error: err.message
    });

  }

});

app.get("/prueba-ruta", (req, res) => {
  res.json({
    ok: true,
    servidor: "server.js",
    ruta: "funcionando"
  });
});

module.exports = app;