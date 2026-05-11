const staff = localStorage.getItem("staff_id")
let timerRFID = null


if(!staff){

  alert("Debes iniciar sesión")

  window.location.href = "login.html"

}

/* ===================================== */
/* CONFIG API */
/* ===================================== */

const API = "http://localhost:3000"

// const API = "http://192.168.100.23:3000"

let scanner = null
let moduloActivo = null

console.log("APP JS CARGADO ✅")

/* ===================================== */
/* MOSTRAR STAFF */
/* ===================================== */

window.addEventListener("DOMContentLoaded", () => {

  const nombre =
  localStorage.getItem("staff_nombre")

  if(nombre){

    document.getElementById(
      "usuario-logeado"
    ).innerText = "👤 " + nombre

  }

  /* AUTOFOCUS */

  const input =
  document.getElementById("userid-pago")

  if(input){
    input.focus()
  }

})

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
/* QR ESCANEADO */
/* ===================================== */

function onScanSuccess(decodedText){

  if(scanner){

    try{
      scanner.clear()
    }catch(e){}

  }

  console.log("QR:", decodedText)

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

  const input =
  document.getElementById(
    `userid-${moduloActivo}`
  )

  if(!input){

    console.warn("Input no encontrado")

    return

  }

  input.value = valor

  cargarUsuario(valor, moduloActivo)

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

    cargarUsuario(
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

  alert("Aquí irán las métricas 📊")

}

function verHistorial(){

  alert("Aquí irá el historial 🧾")

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
  document
  .getElementById(
    "userid-recarga"
  )
  .value
  .trim()

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

  console.log("USER:", user_id)
  console.log("MONTO:", monto)

  if(!user_id){

    alert(
      "Escanea o escribe usuario"
    )

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

    alert(data.mensaje)

    cargarUsuario(
      user_id,
      "recarga"
    )

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
  document
  .getElementById(
    "userid-pago"
  )
  .value
  .trim()

  const monto =
  parseFloat(

    document.getElementById(
      "montoPago"
    ).value

  )

  const staff_id =
  localStorage.getItem(
    "staff_id"
  )

  console.log("USER:", user_id)
  console.log("MONTO:", monto)

  if(!user_id){

    alert(
      "Escanea o escribe usuario"
    )

    return

  }

  if(isNaN(monto) || monto <= 0){

    alert("Carrito vacío")

    return

  }

  if(
    !Array.isArray(carrito)
    || carrito.length === 0
  ){

    alert("Carrito vacío")

    return

  }

  if(!staff_id){

    alert("Debes iniciar sesión")

    window.location.href =
    "login.html"

    return

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

        body: JSON.stringify({

          user_id,
          monto,
          carrito,
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
        "Error en pago"

      )

      return

    }

    alert(data.mensaje)

    cargarUsuario(
      user_id,
      "pago"
    )

    carrito = []

    renderCarrito()

    document.getElementById(
      "userid-pago"
    ).value = ""

    document.getElementById(
      "montoPago"
    ).value = ""

    document.getElementById(
      "userid-pago"
    ).focus()

  }catch(err){

    console.error(
      "ERROR PAGO:",
      err
    )

    alert("Error de conexión")

  }

}

/* ===================================== */
/* MERCADO PAGO */
/* ===================================== */

async function pagarMercadoPago(){

  const user_id =
  document
  .getElementById(
    "userid-recarga"
  )
  .value
  .trim()

  const monto =
  parseFloat(

    document.getElementById(
      "monto-recarga"
    ).value

  )

  if(!user_id){

    alert("Escanea usuario")

    return

  }

  if(
    isNaN(monto)
    || monto <= 0
  ){

    alert("Monto inválido")

    return

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
          monto

        })

      }
    )

    const data =
    await res.json()

    if(
      !res.ok
      || !data.init_point
    ){

      alert(

        data.error ||
        data.mensaje ||
        "Error Mercado Pago"

      )

      return

    }

    window.location.href =
    data.init_point

  }catch(err){

    console.error(
      "ERROR MP:",
      err
    )

    alert("Error Mercado Pago")

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

  const inputPago =
  document.getElementById(
    "montoPago"
  )

  if(inputPago){

    inputPago.value = total

  }

  

}

/* DETECTOR */
function detectarRFID(valor, tipo){

  clearTimeout(timerRFID)

  timerRFID = setTimeout(()=>{

    const limpio =
    valor.trim()

    if(limpio.length < 8){
      return
    }

    cargarUsuario(
      limpio,
      tipo
    )

  },200)

}