 const API = "http://localhost:3000" // PRUEBAS DE QR
//const API = "http://192.168.100.23:3000" // CUALQUIER PERSONA CONECTADA AL WIFI

async function login(){

const nombres = document.getElementById("username").value.trim()
const pin = document.getElementById("pin").value.trim()

// 🔥 VALIDACIÓN
if(!nombres || !pin){
alert("Completa los campos")
return
}

try{

const res = await fetch(API + "/login", {
method: "POST",
headers: { "Content-Type": "application/json" },
body: JSON.stringify({ nombres, pin })
})

const data = await res.json()

if(!res.ok){
alert(data.mensaje || "Credenciales incorrectas")
return
}

// 🔥 GUARDAR SESIÓN
localStorage.setItem("staff_id", data.staff_id)
localStorage.setItem("staff_nombre", data.nombre)

console.log("LOGIN OK:", data)

// 🔥 REDIRECCIÓN
window.location.href = "index.html"

}catch(err){

console.error("ERROR LOGIN:", err)
alert("Error de conexión con el servidor")

}

}