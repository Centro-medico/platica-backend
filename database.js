const { createClient } = require('@supabase/supabase-js');

// Inicializar Supabase
let supabase = null;
let supabaseError = null;

try {
  supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
  );
} catch (error) {
  supabaseError = error.message;
  console.warn('⚠️  No se pudo inicializar Supabase:', supabaseError);
  console.log('📝 Usando base de datos en memoria para testing');
}

// Base de datos en memoria para testing (cuando Supabase no está disponible)
const pacientesEnMemoria = [];
const citasEnMemoria = [];
const conversacionesEnMemoria = [];
let nextPacienteId = 1;
let nextCitaId = 1;

/**
 * Obtener o crear paciente
 * @param {string} telefono - Teléfono del paciente
 * @param {string} nombre - Nombre del paciente
 * @returns {Promise<object>} - Paciente encontrado o creado
 */
async function obtenerOCrearPaciente(telefono, nombre) {
  // Primero, buscar en memoria
  const pacienteEnMemoria = pacientesEnMemoria.find(p => p.telefono === telefono);
  if (pacienteEnMemoria) {
    console.log(`📱 Paciente encontrado en memoria: ${pacienteEnMemoria.nombre}`);
    return pacienteEnMemoria;
  }

  try {
    // Si Supabase está disponible, intentar usar BD
    if (supabase && !supabaseError) {
      try {
        const { data: pacienteExistente, error: errorBusqueda } = await supabase
          .from('pacientes')
          .select('*')
          .eq('telefono', telefono)
          .single();

        if (!errorBusqueda && pacienteExistente) {
          return pacienteExistente;
        }

        const { data: nuevoPaciente, error: errorCreacion } = await supabase
          .from('pacientes')
          .insert([{ telefono, nombre }])
          .select()
          .single();

        if (errorCreacion) throw errorCreacion;

        console.log(`✅ Paciente creado en Supabase: ${nombre}`);
        return nuevoPaciente;
      } catch (supabaseErr) {
        console.warn(`⚠️ Supabase falló, usando memoria:`, supabaseErr.message);
        supabaseError = supabaseErr.message;
      }
    }
  } catch (error) {
    console.error('❌ Error al obtener/crear paciente:', error.message);
  }

  // Crear en memoria si todo lo demás falla
  const nuevoPaciente = {
    id: nextPacienteId++,
    telefono,
    nombre,
    fecha_registro: new Date().toISOString()
  };
  pacientesEnMemoria.push(nuevoPaciente);
  console.log(`✅ Paciente creado en memoria: ${nombre}`);
  return nuevoPaciente;
}

/**
 * Guardar conversación
 * @param {number} pacienteId - ID del paciente
 * @param {string} mensaje - Mensaje del paciente
 * @param {string} respuesta - Respuesta del bot
 * @returns {Promise<object>} - Conversación guardada
 */
async function guardarConversacion(pacienteId, mensaje, respuesta) {
  try {
    if (supabase && !supabaseError) {
      const { data, error } = await supabase
        .from('conversaciones')
        .insert([{
          paciente_id: pacienteId,
          mensaje,
          respuesta,
          tipo: 'texto'
        }])
        .select()
        .single();

      if (error) throw error;
      console.log(`✅ Conversación guardada en Supabase para paciente ${pacienteId}`);
      return data;
    } else {
      // Guardar en memoria
      const conversacion = {
        id: conversacionesEnMemoria.length + 1,
        paciente_id: pacienteId,
        mensaje,
        respuesta,
        tipo: 'texto',
        fecha: new Date().toISOString()
      };
      conversacionesEnMemoria.push(conversacion);
      console.log(`✅ Conversación guardada en memoria para paciente ${pacienteId}`);
      return conversacion;
    }
  } catch (error) {
    console.error('❌ Error al guardar conversación:', error.message);
    throw error;
  }
}

/**
 * Obtener conversaciones de un paciente
 * @param {number} pacienteId - ID del paciente
 * @returns {Promise<Array>} - Array de conversaciones
 */
async function obtenerConversacionesPaciente(pacienteId) {
  try {
    if (supabase && !supabaseError) {
      const { data, error } = await supabase
        .from('conversaciones')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha', { ascending: false })
        .limit(10);

      if (error) throw error;
      return data || [];
    } else {
      // Obtener de memoria
      return conversacionesEnMemoria
        .filter(c => c.paciente_id === pacienteId)
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 10);
    }
  } catch (error) {
    console.error('❌ Error al obtener conversaciones:', error.message);
    return [];
  }
}

/**
 * Agendar cita en BD
 * @param {number} pacienteId - ID del paciente
 * @param {string} fecha - Fecha de la cita (YYYY-MM-DD)
 * @param {string} hora - Hora de la cita (HH:MM)
 * @param {string} razon - Razón de la consulta
 * @returns {Promise<object>} - Cita agendada
 */
async function agendarCitaDB(pacienteId, fecha, hora, razon) {
  try {
    // Intentar Supabase si está disponible
    if (supabase && !supabaseError) {
      try {
        const { data, error } = await supabase
          .from('citas')
          .insert([{
            paciente_id: pacienteId,
            fecha,
            hora,
            razon,
            estado: 'pendiente'
          }])
          .select()
          .single();

        if (error) throw error;
        console.log(`✅ Cita agendada en Supabase para paciente ${pacienteId}`);
        return data;
      } catch (supabaseErr) {
        console.warn(`⚠️ Supabase falló al agendar cita, usando memoria:`, supabaseErr.message);
        supabaseError = supabaseErr.message;
      }
    }
  } catch (error) {
    console.error('❌ Error con Supabase:', error.message);
  }

  // Guardar en memoria como fallback
  const cita = {
    id: nextCitaId++,
    paciente_id: pacienteId,
    fecha,
    hora,
    razon,
    estado: 'pendiente',
    fecha_creacion: new Date().toISOString()
  };
  citasEnMemoria.push(cita);
  console.log(`✅ Cita agendada en memoria para paciente ${pacienteId}`);
  return cita;
}

/**
 * Obtener citas de un paciente
 * @param {number} pacienteId - ID del paciente
 * @returns {Promise<Array>} - Array de citas
 */
async function obtenerCitasPaciente(pacienteId) {
  try {
    if (supabase && !supabaseError) {
      const { data, error } = await supabase
        .from('citas')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha', { ascending: true });

      if (error) throw error;
      return data || [];
    } else {
      // Obtener de memoria
      return citasEnMemoria
        .filter(c => c.paciente_id === pacienteId)
        .sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    }
  } catch (error) {
    console.error('❌ Error al obtener citas:', error.message);
    return [];
  }
}

/**
 * Obtener todos los pacientes
 * @returns {Promise<Array>} - Array de pacientes
 */
async function obtenerPacientes() {
  try {
    // Intentar Supabase si está disponible
    if (supabase && !supabaseError) {
      try {
        const { data, error } = await supabase
          .from('pacientes')
          .select('*')
          .order('fecha_registro', { ascending: false });

        if (error) throw error;
        return data || [];
      } catch (supabaseErr) {
        console.warn(`⚠️ Supabase falló al obtener pacientes, usando memoria:`, supabaseErr.message);
        supabaseError = supabaseErr.message;
      }
    }
  } catch (error) {
    console.error('❌ Error al obtener pacientes:', error.message);
  }

  // Obtener de memoria como fallback
  return pacientesEnMemoria.sort((a, b) =>
    new Date(b.fecha_registro) - new Date(a.fecha_registro)
  );
}

module.exports = {
  obtenerOCrearPaciente,
  guardarConversacion,
  obtenerConversacionesPaciente,
  agendarCitaDB,
  obtenerCitasPaciente,
  obtenerPacientes,
  // Exponer datos en memoria para debugging
  _debug: {
    pacientesEnMemoria,
    citasEnMemoria,
    conversacionesEnMemoria
  }
};
