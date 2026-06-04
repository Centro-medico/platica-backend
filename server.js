require('dotenv').config();
// Force rebuild cache clear
console.log('🔧 Iniciando servidor...');
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { agendarCita, obtenerHorasDisponibles } = require('./googleCalendar');
const {
  obtenerOCrearPaciente,
  guardarConversacion,
  obtenerConversacionesPaciente,
  agendarCitaDB,
  obtenerCitasPaciente,
  obtenerPacientes
} = require('./database');

// Inicializar Express
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

// Inicializar Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Inicializar Claude
console.log('🔑 Inicializando Claude con API Key:', process.env.CLAUDE_API_KEY ? '✅ Presente' : '❌ NO PRESENTE');
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// ============================================
// CARGAR INFORMACIÓN DEL CONSULTORIO
// ============================================
let consultorioInfo = null;
let systemPrompt = null;

function cargarInformacionConsultorio() {
  try {
    const filePath = path.join(__dirname, 'consultorio-info.json');
    const fileContent = fs.readFileSync(filePath, 'utf8');
    consultorioInfo = JSON.parse(fileContent);

    // Crear prompt dinámico basado en la información actualizada
    systemPrompt = generarSystemPrompt(consultorioInfo);
    console.log('✅ Información del consultorio cargada correctamente');
  } catch (error) {
    console.warn('⚠️ Error al cargar información del consultorio:', error.message);
    // Usar prompt por defecto si no puede cargar
    systemPrompt = `Eres un asistente de un consultorio médico. Responde de forma amable y profesional en español.`;
  }
}

function generarSystemPrompt(info) {
  if (!info) return '';

  const servicios = info.servicios
    ? info.servicios.map(s => `- ${s.nombre}: $${s.precio.toFixed(2)} (${s.preparacion})`).join('\n')
    : '';

  const horarios = info.horarios ? `
Horarios:
- Lunes a Viernes: ${info.horarios.lunes_viernes_manana} y ${info.horarios.lunes_viernes_tarde}
- Sábado: ${info.horarios.sabado}
- Domingos: ${info.horarios.domingo}
  ` : '';

  return `Eres un asistente inteligente del ${info.nombre_consultorio || 'consultorio médico'}. Tu objetivo es ayudar a los pacientes respondiendo sus preguntas sobre servicios, precios, horarios, preparación de estudios, y ayudándolos a agendar citas.

INFORMACIÓN DEL CONSULTORIO:
- Nombre: ${info.nombre_consultorio}
- Ubicación: ${info.ubicacion}
- Teléfono: ${info.telefono}
- Email: ${info.email}
${horarios}

SERVICIOS Y PRECIOS:
${servicios}

IMPORTANTE:
1. Responde en ESPAÑOL de forma amable y profesional
2. Si el paciente quiere agendar, solicita: nombre, teléfono, servicio, fecha y hora
3. Si no sabes algo, sugiere llamar a ${info.telefono}
4. Nunca des diagnósticos médicos, recomienda consultar con especialistas
5. Resalta que tenemos especialistas disponibles

NOTA: La información se actualiza automáticamente desde el archivo consultorio-info.json`;
}

// Cargar información al iniciar
cargarInformacionConsultorio();

// ============================================
// RUTA DE PRUEBA
// ============================================
app.get('/', (req, res) => {
  console.log('📊 API KEY en memoria:', process.env.CLAUDE_API_KEY ? '✅ Presente' : '❌ FALTA');
  res.json({
    status: 'Platica Backend está corriendo ✅',
    version: '2.0.0-opus4',
    apiKeyStatus: process.env.CLAUDE_API_KEY ? 'Presente ✅' : 'FALTA ❌',
    timestamp: new Date().toISOString()
  });
});

// ============================================
// WEBHOOK TWILIO WHATSAPP
// ============================================
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { Body: mensaje, From: numeroPaciente, MediaUrl0: mediaUrl } = req.body;

    // Validar que llegó un mensaje
    if (!mensaje || !numeroPaciente) {
      console.warn('⚠️ Webhook sin mensaje o número válido:', { mensaje, numeroPaciente });
      return res.status(200).send('OK'); // Responder OK para no reintentar
    }

    console.log(`📱 Mensaje recibido de ${numeroPaciente}: ${mensaje}`);

    // Obtener o crear paciente
    const paciente = await obtenerOCrearPaciente(numeroPaciente, `Paciente ${numeroPaciente}`);
    console.log(`👤 Paciente: ${paciente.nombre} (ID: ${paciente.id})`);

    // Llamar Claude API para procesar el mensaje
    console.log('🤖 Llamando Claude API...');

    // Recargar información por si fue actualizada
    cargarInformacionConsultorio();

    const respuesta = await anthropic.messages.create({
      model: 'claude-opus-4-1',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: String(mensaje).trim() // Asegurar que es string y limpiar espacios
        }
      ],
      system: systemPrompt // Usar el prompt dinámico que incluye la información actualizada
    });

    const textoRespuesta = respuesta.content[0].text;

    // Guardar conversación en BD
    await guardarConversacion(paciente.id, mensaje, textoRespuesta);

    // Detectar si es una solicitud de cita y agendar
    if (textoRespuesta.toLowerCase().includes('agendar') ||
        mensaje.toLowerCase().includes('cita') ||
        mensaje.toLowerCase().includes('consulta')) {

      console.log('📅 Solicitud de cita detectada');
    }

    // Enviar respuesta vía WhatsApp usando Messaging Service
    // Asegurar que numeroPaciente tenga el prefijo whatsapp:
    const toNumber = numeroPaciente.startsWith('whatsapp:') ? numeroPaciente : `whatsapp:${numeroPaciente}`;

    console.log(`📤 Enviando mensaje a ${toNumber}`);

    await twilioClient.messages.create({
      messagingServiceSid: 'MGb0321ff068ba7ba12263a8f74d44eab5',
      to: toNumber,
      body: textoRespuesta
    });

    res.status(200).send('Mensaje procesado');
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT PARA AGENDAR CITA (Manual)
// ============================================
app.post('/api/agendar', async (req, res) => {
  try {
    const { paciente, fecha, hora, telefono, razon } = req.body;

    if (!paciente || !fecha) {
      return res.status(400).json({ error: 'Faltan datos: paciente y fecha son requeridos' });
    }

    // Usar hora proporcionada o usar default (09:00)
    const horaFinal = hora && hora.trim() ? hora : '09:00';

    // Obtener o crear paciente en BD
    const pacienteDB = await obtenerOCrearPaciente(telefono || paciente, paciente);

    // Agendar en Google Calendar
    const resultado = await agendarCita(paciente, fecha, horaFinal, telefono, razon);

    // Si fue exitoso en Google Calendar, guardar también en BD
    if (resultado.success) {
      await agendarCitaDB(pacienteDB.id, fecha, horaFinal, razon || 'Consulta general');
    }

    res.json(resultado);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT PARA OBTENER HORAS DISPONIBLES
// ============================================
app.get('/api/horas-disponibles/:fecha', async (req, res) => {
  try {
    const { fecha } = req.params;
    const horas = await obtenerHorasDisponibles(fecha);
    res.json({ fecha, horasDisponibles: horas });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT PARA VER TODOS LOS PACIENTES
// ============================================
app.get('/api/pacientes', async (req, res) => {
  try {
    const pacientes = await obtenerPacientes();
    res.json({ total: pacientes.length, pacientes });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT PARA VER CONVERSACIONES DE UN PACIENTE
// ============================================
app.get('/api/pacientes/:id/conversaciones', async (req, res) => {
  try {
    const { id } = req.params;
    const conversaciones = await obtenerConversacionesPaciente(parseInt(id));
    res.json({ pacienteId: id, total: conversaciones.length, conversaciones });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// ENDPOINT PARA VER TODAS LAS CITAS
// ============================================
app.get('/api/citas', async (req, res) => {
  try {
    const pacientes = await obtenerPacientes();
    const todasLasCitas = [];

    // Recolectar citas de cada paciente
    for (const paciente of pacientes) {
      const citasPaciente = await obtenerCitasPaciente(paciente.id);
      for (const cita of citasPaciente) {
        todasLasCitas.push({
          ...cita,
          paciente: paciente.nombre,
          telefono: paciente.telefono
        });
      }
    }

    // Ordenar por fecha
    todasLasCitas.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

    res.json({
      total: todasLasCitas.length,
      citas: todasLasCitas
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONFIGURAR WEBHOOK EN TWILIO AUTOMÁTICAMENTE
// ============================================
async function configurarWebhook() {
  try {
    // URL del webhook (necesita estar en HTTPS con ngrok)
    const webhookUrl = 'https://rockfish-sequester-showbiz.ngrok-free.dev/webhook/whatsapp';

    console.log('⚙️ Configurando webhook en Twilio...');

    // Obtener servicio de Messaging
    const messagingServices = await twilioClient.messaging.services.list({ limit: 1 });

    if (messagingServices.length > 0) {
      const service = messagingServices[0];

      // Actualizar webhook
      await twilioClient.messaging.services(service.sid)
        .update({
          inboundRequestUrl: webhookUrl,
          inboundMethod: 'POST'
        });

      console.log(`✅ Webhook configurado: ${webhookUrl}`);
    } else {
      console.log('⚠️ No se encontró servicio de Messaging. Continuando sin configuración automática.');
    }
  } catch (error) {
    console.log('⚠️ No se pudo configurar webhook automáticamente (normal en Sandbox)');
    console.log('📝 Webhook manual: https://rockfish-sequester-showbiz.ngrok-free.dev/webhook/whatsapp');
  }
}

// ============================================
// INICIAR SERVIDOR
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`🚀 Platica Backend v2.0 corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook: https://rockfish-sequester-showbiz.ngrok-free.dev/webhook/whatsapp`);

  // Intentar configurar webhook
  await configurarWebhook();
});
