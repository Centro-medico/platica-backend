require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const twilio = require('twilio');
const Anthropic = require('@anthropic-ai/sdk');
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
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY
});

// ============================================
// RUTA DE PRUEBA
// ============================================
app.get('/', (req, res) => {
  res.json({
    status: 'Platica Backend está corriendo ✅',
    version: '1.0.0'
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
    const respuesta = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: String(mensaje).trim() // Asegurar que es string y limpiar espacios
        }
      ],
      system: `Eres un asistente de un consultorio médico.
      Responde de forma amable y profesional en español.
      Si el paciente quiere agendar una cita, extrae:
      - Nombre del paciente
      - Fecha deseada (YYYY-MM-DD)
      - Hora (HH:MM)
      - Razón de la consulta
      Y responde: "Entendido, voy a agendar tu cita para [fecha] a las [hora]".`
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

    // Enviar respuesta vía WhatsApp
    await twilioClient.messages.create({
      from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
      to: numeroPaciente,
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
  console.log(`🚀 Platica Backend corriendo en puerto ${PORT}`);
  console.log(`📱 Webhook: https://rockfish-sequester-showbiz.ngrok-free.dev/webhook/whatsapp`);

  // Intentar configurar webhook
  await configurarWebhook();
});
