# 📋 CÓMO ACTUALIZAR LA INFORMACIÓN DEL CONSULTORIO

## ⚠️ IMPORTANTE

**Esta es la forma SEGURA de actualizar la información sin romper nada.**

---

## 📁 Archivos que contienen la información:

1. **`consultorio-info.json`** ← Actualiza AQUÍ los datos del consultorio
2. **`claude-system-prompt.txt`** ← Se regenera automáticamente desde el JSON

---

## 🔄 Pasos para actualizar:

### 1️⃣ **Abrir el archivo `consultorio-info.json`**

Este archivo está en: `D:\Platica\backend\consultorio-info.json`

Abrirlo con cualquier editor de texto (Notepad, VS Code, etc.)

---

### 2️⃣ **Qué puedes cambiar:**

#### **A) Horarios**
```json
"horarios": {
  "lunes_viernes_manana": "8:00 AM - 12:00 PM",  ← Cambiar aquí
  "lunes_viernes_tarde": "2:00 PM - 5:00 PM",    ← Cambiar aquí
  "sabado": "8:00 AM - 12:00 PM",                ← Cambiar aquí
  ...
}
```

#### **B) Teléfono y Email**
```json
"telefono": "+593 96 943 8199",          ← Actualizar
"email": "centromedico.nrdguez@gmail.com"  ← Actualizar
```

#### **C) Precios y Servicios**
```json
"servicios": [
  {
    "nombre": "ABDOMEN RENAL",
    "precio": 30.00,              ← Cambiar el precio
    "preparacion": "...",         ← Cambiar la preparación
    "se_revisa": "..."            ← Cambiar qué se revisa
  },
  ...
]
```

**Para agregar un nuevo servicio:**
```json
{
  "nombre": "NOMBRE DEL NUEVO SERVICIO",
  "precio": 25.00,
  "preparacion": "NO LLEVA PREPARACION",
  "se_revisa": "Lo que se va a revisar"
}
```

Agregar esta entrada en la lista de servicios.

#### **D) Equipo Médico**
```json
"equipo_medico": [
  {
    "cargo": "Directora",
    "nombre": "Dra. Norys Rodríguez",
    "especialidad": "Especialista en Medicina General Integral, Master en Ecografías"
  },
  ...
]
```

#### **E) Ubicación**
```json
"ubicacion": "Avenida 9 de octubre y Parrales, Paján, Manabí"  ← Cambiar aquí
```

---

### 3️⃣ **Guardar el archivo**

**Muy importante:** Guardar con `Ctrl + S` o mediante el menú "Archivo > Guardar"

---

### 4️⃣ **Lo que sucede automáticamente:**

✅ Una vez que guardas el archivo `consultorio-info.json`:
- El servidor AUTOMÁTICAMENTE lee los nuevos datos
- Claude usa la información actualizada
- Los pacientes recibirán respuestas con los datos nuevos

**⚠️ NO necesitas hacer push a GitHub ni reiniciar el servidor. Sucede automáticamente.**

---

## 📝 Ejemplos de cambios:

### Ejemplo 1: Cambiar un precio
```json
// ANTES:
{"nombre": "TERAPIA", "precio": 30.00, ...}

// DESPUÉS:
{"nombre": "TERAPIA", "precio": 35.00, ...}
```

### Ejemplo 2: Cambiar horario de atención
```json
// ANTES:
"lunes_viernes_manana": "8:00 AM - 12:00 PM"

// DESPUÉS:
"lunes_viernes_manana": "7:30 AM - 1:00 PM"
```

### Ejemplo 3: Agregar un nuevo servicio
```json
"servicios": [
  { "nombre": "ABDOMEN RENAL", ... },
  { "nombre": "NUEVO SERVICIO", "precio": 50.00, "preparacion": "...", "se_revisa": "..." }
]
```

---

## ⚠️ NOTAS IMPORTANTES:

1. **Respetar el formato JSON:**
   - No borrar comillas `"`
   - No borrar comas `,`
   - No borrar llaves `{}` o corchetes `[]`
   - Si editas mal, el servidor no funcionará

2. **Moneda:** Todos los precios están en USD ($)

3. **Lenguaje:** Mantener todo en ESPAÑOL

4. **Validar el JSON:**
   - Si no estás seguro si es correcto, usa: https://jsonlint.com/
   - Pega el contenido del archivo y valida

5. **Hacer backup:**
   - Antes de cambios grandes, copia el archivo original
   - Nombre: `consultorio-info.json.backup`

---

## 🆘 Si algo sale mal:

Si el servidor deja de responder después de cambios:

1. Revisa que el JSON sea válido
2. Restaura el backup si tienes
3. Contacta al desarrollador con los cambios que hiciste

---

## 📞 Contacto para errores:

Si al editar el JSON algo no funciona:

**Teléfono del consultorio:** +593 96 943 8199
**Email:** centromedico.nrdguez@gmail.com

---

**¡Es muy simple! Solo edita el JSON y guarda. El servidor se actualiza automáticamente.** ✅
