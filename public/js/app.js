const staff = localStorage.getItem("staff_id")
let timerRFID = null
let ultimoUsuarioRecarga = null
let ultimoUsuarioPago = null
let stripe;
let elements;
let stripeClientSecret;

if(!staff){
  alert("Debes iniciar sesión")
  window.location.href = "login.html"
}

/* CONFIG API */

const modo = localStorage.getItem("modo") || "local";
const API = window.location.origin;
let scanner = null
let moduloActivo = null

/* Obtiene el id del evento actual  */

/*const idEvento =
  new URLSearchParams(window.location.search).get("id_evento")
  || localStorage.getItem("id_evento");
*/

const idEvento = 1;

/* MOSTRAR STAFF */

window.addEventListener("DOMContentLoaded", () => {

  const nombre = localStorage.getItem("staff_nombre")
  const modo = localStorage.getItem("modo") || "local"

  if(nombre){

    document.getElementById(
      "usuario-logeado"
    ).innerText =
    `👤 ${nombre} | ${modo.toUpperCase()}`

  }


  const params = new URLSearchParams(window.location.search);

if(params.get("recarga") === "success"){
  alert("✅ Recarga realizada correctamente");
  window.history.replaceState({},document.title,"index.html");
}

if(params.get("recarga") === "failure"){
  alert("❌ La recarga no se completó");
  window.history.replaceState({},document.title,"index.html");
}

if(params.get("recarga") === "pending"){
  alert("⏳ La recarga quedó pendiente");
  window.history.replaceState({},document.title,"index.html");
}

});

/* ===================================== */
/* INICIAR SCANNER */
/* ===================================== */

function iniciarScanner(modulo){

  moduloActivo = modulo

  const readerId =
  modulo === "recarga"
  ? "reader-recarga"
  : "reader-pago"

  document.getElementById(
    readerId
  ).innerHTML = ""

  if(scanner){

    scanner.clear().catch(()=>{})

  }

  scanner = new Html5QrcodeScanner(

    readerId,

    {
      fps:10,
      qrbox:250
    }

  )

  scanner.render(onScanSuccess)

}

/* ===================================== */
/* CARGAR PRODUCTOS */
/* ===================================== */

async function cargarProductos(){

  const contenedor =
    document.getElementById("productos");

  if(!contenedor){
    console.warn("No existe contenedor #productos");
    return;
  }

  if(!idEvento){

    console.warn("No existe id_evento");

    contenedor.innerHTML = `
      <div class="productos-loading">
        ⚠ Evento no identificado
      </div>
    `;

    return;
  }

  try{

    contenedor.innerHTML = `
      <div class="productos-loading">
        Cargando productos...
      </div>
    `;

    const res =
      await fetch(
        API +
        "/cash/productos?id_evento=" +
        encodeURIComponent(idEvento)
      );

    const data =
      await res.json();

    if(!res.ok){

      throw new Error(
        data.error ||
        data.mensaje ||
        "No fue posible obtener productos"
      );

    }

    contenedor.innerHTML = "";

    if(
      !Array.isArray(data)
      || data.length === 0
    ){

      contenedor.innerHTML = `
        <div class="productos-loading">
          No hay productos disponibles
        </div>
      `;

      return;
    }

    data.forEach(producto => {

      const boton =
        document.createElement("button");

      boton.type = "button";

      /* Mantener estilo especial de cortesía */
      if(
        Number(producto.precio) === 0
      ){
        boton.classList.add(
          "producto-cortesia"
        );
      }

      boton.innerHTML = `
        ${obtenerIconoProducto(producto.nombre)}
        ${producto.nombre}
        ·
        ${
          Number(producto.precio) === 0
            ? "Cortesía"
            : "$" + Number(producto.precio).toFixed(0)
        }
      `;

      boton.addEventListener(
        "click",
        () => {

          agregarProducto(
            Number(producto.id),
            producto.nombre,
            Number(producto.precio)
          );

        }
      );

      contenedor.appendChild(
        boton
      );

    });

  }catch(err){

    console.error(
      "ERROR PRODUCTOS:",
      err
    );

    contenedor.innerHTML = `
      <div class="productos-loading">
        ⚠ Error cargando productos
      </div>
    `;

  }

}

function obtenerIconoProducto(nombre){

  const n =
    String(nombre)
      .toLowerCase();

  if(n.includes("cerveza")){
    return "🍺";
  }

  if(n.includes("six")){
    return "🍺";
  }

  if(n.includes("trago")){
    return "🍸";
  }

  if(n.includes("maruchan")){
    return "🍜";
  }

  if(n.includes("agua")){
    return "💧";
  }

  if(n.includes("electrolit")){
    return "⚡";
  }

  if(n.includes("cigarro")){
    return "🚬";
  }

  if(n.includes("dj")){
    return "🎧";
  }

  return "🛒";
}
/* ===================================== */
/* QR ESCANEADO */
/* ===================================== */

function onScanSuccess(decodedText){

  if(scanner){

    try{
      scanner.clear()
    }catch(e){}

  }

  const valor =
  decodedText.trim()

  if(!valor){

    alert("Código inválido ❌")

    return

  }

  if(!moduloActivo){

    console.warn("No hay módulo activo")

    return

  }

  detectarRFID(
    valor,
    moduloActivo
  )

}

/* ===================================== */
/* INPUT AUTOMÁTICO */
/* RFID / QR / MANUAL */
/* ===================================== */

document
.getElementById("userid-recarga")
.addEventListener("input", (e) => {

  const valor =
  e.target.value.trim()

  if(valor.length >= 1){

    detectarRFID(
      valor,
      "recarga"
    )

  }

})

document
.getElementById("userid-pago")
.addEventListener("input", (e) => {

  const valor =
  e.target.value.trim()

  if(valor.length >= 1){

    detectarRFID(
      valor,
      "pago"
    )

  }

})

/* ===================================== */
/* MONTOS */
/* ===================================== */

function setMonto(valor){

  document.getElementById(
    "monto-recarga"
  ).value = valor

}

function setPago(valor){

  document.getElementById(
    "montoPago"
  ).value = valor

}

/* ===================================== */
/* CONSULTAR USUARIO */
/* ===================================== */

async function cargarUsuario(valor, tipo){

  try{

    const res =
    await fetch(
      API + "/usuario/" + valor
    )

    const el =
    document.getElementById(
      "info-" + tipo
    )

    if(!el) return

    /* NO ENCONTRADO */

    if(!res.ok){

      el.style.display = "block"

      el.innerHTML = `
        <div style="
          color:#ff6b6b;
          font-weight:700;
        ">
          Usuario no encontrado
        </div>
      `

      return

    }

    /* DATA */

    const data =
    await res.json()

    /* MOSTRAR */

    el.style.display = "block"

    el.innerHTML = `

      <div style="
        font-size:18px;
        font-weight:800;
        margin-bottom:6px;
      ">
        ${data.desc_dispositivo}
      </div>

      <div style="
        color:#00ffd0;
        font-size:24px;
        font-weight:900;
      ">
        Saldo: $${data.saldo}
      </div>

    `

  }catch(err){

    console.error(
      "ERROR USER:",
      err
    )

  }

}

/* ===================================== */
/* NAV */
/* ===================================== */

function irMetricas(){

  window.location.href =
  "metricas.html";

}

function verHistorial(){

  window.location.href =
  "historial.html";

}

function logout(){

  localStorage.clear()

  window.location.href =
  "login.html"

}

/* ===================================== */
/* RECARGAR */
/* ===================================== */

async function recargar(){

  const user_id =
  ultimoUsuarioRecarga

  const monto =
  parseFloat(

    document.getElementById(
      "monto-recarga"
    ).value

  )

  const staff_id =
  localStorage.getItem(
    "staff_id"
  )

  if(!user_id){
    alert("Escanea o escribe usuario")
    return
  }

  if(isNaN(monto) || monto <= 0){
    alert("Monto inválido")
    return
  }

  try{

    const res =
    await fetch(
      API + "/recargar",
      {

        method:"POST",

        headers:{
          "Content-Type":
          "application/json"
        },

        body: JSON.stringify({

          user_id,
          monto,
          staff_id

        })

      }
    )

    const data =
    await res.json()

    if(!res.ok){

      alert(

        data.mensaje ||
        data.error ||
        "Error en recarga"

      )
      return
    }

    /* ACTUALIZAR INFO */

    document.getElementById(
      "info-recarga"
    ).innerHTML = `

      <div style="
        font-size:18px;
        font-weight:800;
        margin-bottom:6px;
      ">
        ✅ Recarga exitosa
      </div>

      <div style="
        color:#00ffd0;
        font-size:24px;
        font-weight:900;
      ">
        Nuevo saldo: $${data.saldo}
      </div>
    `

    /* LIMPIAR */

    ultimoUsuarioRecarga = null

    document.getElementById(
      "monto-recarga"
    ).value = ""

  }catch(err){

    console.error(
      "ERROR RECARGA:",
      err
    )
    alert("Error de conexión")
  }
}

/* ===================================== */
/* PAGAR */
/* ===================================== */

async function pagar(){

  const user_id =
    ultimoUsuarioPago;

  const monto =
    carrito.reduce(
      (total, producto) =>
        total + (producto.precio * producto.cantidad),
      0
    );

  const staff_id =
    localStorage.getItem(
      "staff_id"
    );

  if(!user_id){

    alert(
      "Escanea o escribe usuario"
    );

    return;

  }

  if(monto <= 0){

    alert("Carrito vacío");

    return;

  }

  if(
    !Array.isArray(carrito)
    || carrito.length === 0
  ){

    alert("Carrito vacío");

    return;

  }

  if(!staff_id){

    alert("Debes iniciar sesión");

    window.location.href =
      "login.html";

    return;

  }

  try{

    const res =
      await fetch(
        API + "/pagar",
        {
          method:"POST",
          headers:{
            "Content-Type":
              "application/json"
          },
          body:JSON.stringify({
            user_id,
            monto,
            carrito,
            staff_id
          })
        }
      );

    const data =
      await res.json();

    if(!res.ok){

      alert(
        data.mensaje ||
        data.error ||
        "Error en pago"
      );

      return;

    }

    alert(data.mensaje);
    ultimoUsuarioPago = null;
    carrito = [];
    renderCarrito();

  }catch(err){

    console.error(
      "ERROR PAGO:",
      err
    );

    alert("Error de conexión");

  }

}
/* ===================================== */
/* MERCADO PAGO */
/* ===================================== */

async function pagarMercadoPago(){

  const user_id = ultimoUsuarioRecarga;

  const monto =
    parseFloat(
      document.getElementById(
        "monto-recarga"
      ).value
    );

  const staff_id =
    localStorage.getItem("staff_id");

  if(!staff_id){
    alert("No hay staff en sesión");
    return;
  }

  if(!user_id){
    alert("Escanea usuario");
    return;
  }

  if(
    isNaN(monto)
    || monto <= 0
  ){
    alert("Monto inválido");
    return;
  }

  try{

    const res =
      await fetch(
        API + "/crear-recarga-mp",
        {
          method:"POST",

          headers:{
            "Content-Type":
              "application/json"
          },

          body: JSON.stringify({
            user_id,
            monto,
            staff_id
          })
        }
      );

    const data =
      await res.json();

    if(
      !res.ok
      || !data.init_point
    ){

      alert(
        data.error ||
        data.mensaje ||
        "Error Mercado Pago"
      );

      return;
    }

    window.location.href =
      data.init_point;

  }catch(err){

    console.error(
      "ERROR MP:",
      err
    );

    alert("Error Mercado Pago");
  }
}
/* STRIPE */

async function pagarStripe(){

  const user_id = ultimoUsuarioRecarga;

  const monto =
    parseFloat(
      document.getElementById(
        "monto-recarga"
      ).value
    );

const staff_id =
localStorage.getItem("staff_id");

if(!staff_id){

  alert("No hay staff en sesión");

  return;

}

if(!user_id){

  alert("Escanea usuario");

  return;

}

if(
  isNaN(monto)
  || monto <= 0
){

  alert("Monto inválido");

  return;

}

  try{

    const res =
      await fetch(
        API + "/crear-recarga-stripe",
        {

          method:"POST",

          headers:{
            "Content-Type":
            "application/json"
          },

          body: JSON.stringify({
            user_id,
            monto,
            staff_id
          })

        }
      );

    const data =
      await res.json();

  stripeClientSecret = data.clientSecret;

mostrarModalStripe();

  }catch(err){

    console.error(
      "STRIPE ERROR:",
      err
    );

  }

}


/* ===================================== */
/* CARRITO */
/* ===================================== */

let carrito = []

function agregarProducto(
  producto_id,
  nombre,
  precio
){

  const existe =
  carrito.find(

    p =>
    p.producto_id === producto_id

  )

  if(existe){

    existe.cantidad++

  }else{

    carrito.push({
      producto_id,
      nombre,
      precio,
      cantidad:1
    })
  }
  renderCarrito()
}

/* ===================================== */
/* ELIMINAR PRODUCTO */
/* ===================================== */

function eliminarProducto(nombre){

  carrito =
  carrito.filter(
    p => p.nombre !== nombre
  )

  renderCarrito()

}

/* ===================================== */
/* LIMPIAR CARRITO */
/* ===================================== */

function limpiarCarrito(){
  carrito = []
  renderCarrito()
}

/* ===================================== */
/* RENDER CARRITO */
/* ===================================== */

function renderCarrito(){

  const contenedor =
  document.getElementById(
    "carrito"
  )

  const totalBox =
  document.getElementById(
    "total-box"
  )

  if(
    !contenedor
    || !totalBox
  ){
    return
  }

  contenedor.innerHTML = ""

  let total = 0

  carrito.forEach(p => {

    const subtotal =
    p.precio * p.cantidad

    total += subtotal

    contenedor.innerHTML += `

      <div class="item-carrito">

        <div>
          ${p.nombre} x${p.cantidad}
        </div>

        <div style="
          display:flex;
          align-items:center;
          gap:10px;
        ">

          <strong>
            $${subtotal}
          </strong>

          <button
            class="eliminar-btn"
            onclick="
              eliminarProducto(
                '${p.nombre}'
              )
            "
          >
            ✕
          </button>

        </div>

      </div>

    `

  })

  totalBox.innerHTML = `
    Total: $${total}
  `
}

/* ===================================== */
/* 🔥 DETECTOR RFID / QR */
/* ===================================== */

function detectarRFID(valor, tipo){

  clearTimeout(timerRFID);

  timerRFID = setTimeout(async () => {

    const limpio = valor.trim();

    /* QUITAR CEROS A LA IZQUIERDA SI EXISTEN */
    const id = limpio.replace(/^0+/, "");

    /* SOLO VALIDAR QUE SEAN NÚMEROS */
    if(!/^\d+$/.test(id)){
      console.warn(
        "RFID inválido:",
        limpio,
        "=>",
        id
      );
      return;
    }

    console.log(
      "✅ RFID:",
      limpio,
      "=> ID BD:",
      id
    );

    /* GUARDAR USUARIO */

    if(tipo === "recarga"){
      ultimoUsuarioRecarga = id;
    }else{
      ultimoUsuarioPago = id;
    }

    /* INPUT */

    const input =
      document.getElementById(
        `userid-${tipo}`
      );

    if(!input){
      console.error(
        "No existe input:",
        `userid-${tipo}`
      );
      return;
    }

    /* EFECTO VISUAL */

    input.classList.add("scanned");

    setTimeout(() => {
      input.classList.remove("scanned");
    },400);

    /* CONSULTAR USUARIO */

    await cargarUsuario(
      id,
      tipo
    );

    /* LIMPIAR */

    input.value = "";
    input.focus();

  },300);

}

async function mostrarModalStripe(){

  stripe = Stripe(
    "pk_test_51TlwPJELrOUgkIrx4ZAqN0ZtA4d5H4bba5XnjmIRc5I0VWHiloSbabF349rj9mBeSsJkYoyLRA2diY2kEYjfgyhC00srU3IRZH"
  );

  elements = stripe.elements({
    clientSecret: stripeClientSecret
  });

  const paymentElement =
    elements.create("payment");

  document.getElementById(
    "payment-element"
  ).innerHTML = "";

  paymentElement.mount(
    "#payment-element"
  );

  document.getElementById(
    "stripe-modal"
  ).style.display = "flex";

}

function cerrarModalStripe(){

  document.getElementById(
    "stripe-modal"
  ).style.display = "none";

}

async function confirmarPagoStripe(){

  const { error } =
    await stripe.confirmPayment({

      elements,

      confirmParams:{
  return_url:
    window.location.origin +
    "/successfully.html"
}

    });

  if(error){

    alert(
      error.message
    );

  }

}

function mostrarModulo(modulo) {
  const panelRecarga = document.querySelector(".panel-izq");
  const panelVenta = document.querySelector(".panel-der");

  const btnRecarga = document.getElementById(
    "btn-modulo-recarga"
  );

  const btnVenta = document.getElementById(
    "btn-modulo-venta"
  );

  if (
    !panelRecarga ||
    !panelVenta ||
    !btnRecarga ||
    !btnVenta
  ) {
    return;
  }

  const mostrarRecarga =
    modulo === "recarga";

  panelRecarga.classList.toggle(
    "modulo-visible",
    mostrarRecarga
  );

  panelRecarga.classList.toggle(
    "modulo-oculto",
    !mostrarRecarga
  );

  panelVenta.classList.toggle(
    "modulo-visible",
    !mostrarRecarga
  );

  panelVenta.classList.toggle(
    "modulo-oculto",
    mostrarRecarga
  );

  btnRecarga.classList.toggle(
    "active",
    mostrarRecarga
  );

  btnVenta.classList.toggle(
    "active",
    !mostrarRecarga
  );

  const inputActivo = document.getElementById(
  mostrarRecarga
    ? "userid-recarga"
    : "userid-pago"
);

setTimeout(() => {
  if(inputActivo){
    inputActivo.focus();
  }
}, 100);

  window.scrollTo({
    top: 0,
    behavior: "smooth"
  });
}

document.addEventListener(
  "DOMContentLoaded",
  () => {

    mostrarModulo("recarga");

    cargarProductos();

  }
);

/* ===================================== */
/* RETORNO STRIPE */
/* ===================================== */

window.addEventListener("load", async () => {

  const params =
    new URLSearchParams(
      window.location.search
    );

  const status =
    params.get("redirect_status");

  if(status !== "succeeded"){
    return;
  }

  alert("✅ Recarga realizada correctamente.");

  window.history.replaceState(
    {},
    document.title,
    window.location.pathname
  );

  cerrarModalStripe();

  document.getElementById(
    "monto-recarga"
  ).value = "";

  if(ultimoUsuarioRecarga){

    await cargarUsuario(
      ultimoUsuarioRecarga,
      "recarga"
    );
  }
});