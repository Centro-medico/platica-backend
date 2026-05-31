const { google } = require('googleapis');

// Inicializar Google Calendar
const calendar = google.calendar({
  version: 'v3',
  auth: process.env.GOOGLE_CALENDAR_API_KEY
});

/**
 * Agendar una cita en Google Calendar
 * @param {string} pacienteNombre - Nombre del paciente
 * @param {string} fecha - Fecha de la cita (YYYY-MM-DD)
 * @param {string} hora - Hora de la cita (HH:MM)
 * @param {string} telefono - Teléfono del paciente
 * @param {string} razon - Razón de la consulta
 * @returns {Promise<object>} - Evento creado en Google Calendar o resultado sin Google Calendar
 */
async function agendarCita(pacienteNombre, fecha, hora, telefono, razon = 'Consulta general') {
  try {
    // Validar fecha y hora
    if (!fecha || !hora) {
      throw new Error('Fecha y hora son requeridas');
    }

    // Combinar fecha y hora
    const [year, month, day] = fecha.split('-');
    const [hours, minutes] = hora.split(':');

    const startTime = new Date(year, month - 1, day, parseInt(hours), parseInt(minutes));
    const endTime = new Date(startTime);
    endTime.setHours(endTime.getHours() + 1); // Consulta de 1 hora

    console.log(`📅 Intento de agendar cita: ${pacienteNombre} el ${fecha} a las ${hora}`);

    // Intentar crear evento en Google Calendar
    try {
      const event = {
        summary: `Consulta - ${pacienteNombre}`,
        description: `Paciente: ${pacienteNombre}\nTeléfono: ${telefono}\nRazón: ${razon}`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: 'America/Guayaquil'
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: 'America/Guayaquil'
        },
        attendees: [
          {
            email: 'centromedico.nrdguez@gmail.com',
            responseStatus: 'accepted'
          }
        ]
      };

      const resultado = await calendar.events.insert({
        calendarId: 'primary',
        resource: event,
        sendUpdates: 'all'
      });

      console.log(`✅ Cita agendada en Google Calendar: ${pacienteNombre} el ${fecha} a las ${hora}`);
      return {
        success: true,
        eventId: resultado.data.id,
        fecha: fecha,
        hora: hora,
        paciente: pacienteNombre,
        calendar: 'google'
      };
    } catch (googleError) {
      console.warn(`⚠️ No se pudo agendar en Google Calendar: ${googleError.message}`);
      console.warn('Continuando sin Google Calendar...');

      // Si Google Calendar falla, aún así retornar éxito para guardar en BD
      return {
        success: true,
        eventId: null,
        fecha: fecha,
        hora: hora,
        paciente: pacienteNombre,
        calendar: 'database_only',
        warning: 'Cita guardada en base de datos pero no en Google Calendar'
      };
    }
  } catch (error) {
    console.error('❌ Error al agendar cita:', error.message);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * Obtener citas disponibles para una fecha
 * @param {string} fecha - Fecha para verificar (YYYY-MM-DD)
 * @returns {Promise<Array>} - Array de horas disponibles
 */
async function obtenerHorasDisponibles(fecha) {
  try {
    const [year, month, day] = fecha.split('-');
    const startOfDay = new Date(year, month - 1, day, 0, 0, 0).toISOString();
    const endOfDay = new Date(year, month - 1, day, 23, 59, 59).toISOString();

    const eventos = await calendar.events.list({
      calendarId: 'primary',
      timeMin: startOfDay,
      timeMax: endOfDay,
      singleEvents: true,
      orderBy: 'startTime'
    });

    // Horas disponibles: 8:00 - 18:00
    const horasDisponibles = [];
    const horasOcupadas = new Set();

    eventos.data.items?.forEach(evento => {
      const hora = new Date(evento.start.dateTime).getHours();
      horasOcupadas.add(hora);
    });

    for (let hora = 8; hora < 18; hora++) {
      if (!horasOcupadas.has(hora)) {
        horasDisponibles.push(`${hora}:00`);
      }
    }

    return horasDisponibles;
  } catch (error) {
    console.error('❌ Error al obtener horas disponibles:', error.message);
    return [];
  }
}

module.exports = {
  agendarCita,
  obtenerHorasDisponibles
};
