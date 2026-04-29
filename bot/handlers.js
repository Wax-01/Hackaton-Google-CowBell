// ============================================
// COWBELL BOT - Message Handlers
// ============================================
// Pipeline: Telegram message → Gemini → Function Call → Firebase → Response
// ============================================

import { processMessage, sendFunctionResult, processAudio } from './gemini.js';
import {
  getCattle,
  getCowByName,
  moveCowToFence,
  createFence,
  getFences,
  getRecentAlerts,
  registerCow,
  deleteCow,
  getFarmSummary
} from './firebase.js';

// ============================================
// COMMAND HANDLERS (/start, /ayuda, /estado)
// ============================================

export async function handleStart(bot, msg) {
  const chatId = msg.chat.id;
  const name = msg.from.first_name || 'Amigo';

  await bot.sendMessage(chatId,
    `🐄 *¡Hola ${name}! Soy Centinela* 🔔\n\n` +
    `Tu asistente inteligente de *CowBell* para gestionar tu finca.\n\n` +
    `Puedes hablarme como le hablarías a un amigo:\n\n` +
    `📝 *Escríbeme cosas como:*\n` +
    `• _"¿Cómo están las vacas?"_\n` +
    `• _"Registra una vaca nueva, se llama Estrella"_\n` +
    `• _"¿Hay alguna alerta?"_\n` +
    `• _"¿Cómo va la finca?"_\n\n` +
    `🎤 *O envíame un audio* con tus instrucciones\n\n` +
    `¡Estoy listo para ayudarte! 🚀`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleHelp(bot, msg) {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId,
    `📋 *Comandos disponibles:*\n\n` +
    `🐄 *Ganado:*\n` +
    `• _"¿Cómo están las vacas?"_\n` +
    `• _"¿Cómo está la Lola?"_\n` +
    `• _"Registra una vaca llamada Luna"_\n` +
    `• _"Elimina a la vaca Canela"_\n\n` +
    `🗺️ *Cercas y Zonas:*\n` +
    `• _"¿Cuáles zonas tengo?"_\n` +
    `• _"Crea una zona llamada Potrero 2"_\n` +
    `🔔 *Alertas:*\n` +
    `• _"¿Hay alertas?"_\n` +
    `• _"¿Qué ha pasado?"_\n\n` +
    `📊 *General:*\n` +
    `• _"¿Cómo va la finca?"_\n` +
    `• _"Dame un resumen"_\n\n` +
    `💡 _También puedes enviar audios con tus instrucciones_`,
    { parse_mode: 'Markdown' }
  );
}

export async function handleStatus(bot, msg) {
  const chatId = msg.chat.id;
  await bot.sendMessage(chatId, '⏳ Consultando estado de la finca...');

  try {
    const summary = await getFarmSummary();
    const statusText = formatFarmSummary(summary);
    await bot.sendMessage(chatId, statusText, { parse_mode: 'Markdown' });
  } catch (error) {
    await bot.sendMessage(chatId, '⚠️ Error consultando el estado. Intenta de nuevo.');
  }
}

// ============================================
// MAIN MESSAGE HANDLER — The AI Pipeline
// ============================================

export async function handleTextMessage(bot, msg) {
  const chatId = msg.chat.id;
  const text = msg.text;

  // Skip if it's a command
  if (text.startsWith('/')) return;

  // Show "typing" indicator
  await bot.sendChatAction(chatId, 'typing');

  console.log(`📩 [${msg.from.first_name}]: ${text}`);

  // Step 1: Send to Gemini
  const geminiResult = await processMessage(text);

  // Step 2: Handle the result
  if (geminiResult.type === 'function_call') {
    await executeFunctionCall(bot, chatId, geminiResult);
  } else if (geminiResult.type === 'text') {
    await bot.sendMessage(chatId, geminiResult.text);
  } else {
    await bot.sendMessage(chatId, geminiResult.text || '⚠️ Error procesando el mensaje.');
  }
}

// ============================================
// VOICE MESSAGE HANDLER
// ============================================

export async function handleVoiceMessage(bot, msg) {
  const chatId = msg.chat.id;

  await bot.sendMessage(chatId, '🎤 Escuchando tu audio...');
  await bot.sendChatAction(chatId, 'typing');

  try {
    // Download the voice file
    const fileId = msg.voice?.file_id || msg.audio?.file_id;
    if (!fileId) {
      await bot.sendMessage(chatId, '⚠️ No pude recibir el audio. Intenta de nuevo.');
      return;
    }

    const fileLink = await bot.getFileLink(fileId);
    const response = await fetch(fileLink);
    const audioBuffer = Buffer.from(await response.arrayBuffer());

    // Process through Gemini
    const geminiResult = await processAudio(audioBuffer, 'audio/ogg');

    if (geminiResult.type === 'function_call') {
      await executeFunctionCall(bot, chatId, geminiResult);
    } else {
      await bot.sendMessage(chatId, geminiResult.text);
    }
  } catch (error) {
    console.error('Voice handler error:', error);
    await bot.sendMessage(chatId, '⚠️ No pude procesar el audio. ¿Podrías escribirme?');
  }
}

// ============================================
// FUNCTION CALL EXECUTOR
// ============================================
// This is where Gemini's structured output becomes real actions

async function executeFunctionCall(bot, chatId, geminiResult) {
  const { functionName, args, chat } = geminiResult;

  console.log(`⚡ Function Call: ${functionName}(${JSON.stringify(args)})`);

  let result;
  let responseText;

  try {
    switch (functionName) {
      // ---- CONSULTAR GANADO ----
      case 'consultar_ganado': {
        if (args.nombre_vaca) {
          const cow = await getCowByName(args.nombre_vaca);
          if (cow) {
            result = {
              encontrada: true,
              nombre: cow.name,
              numero: cow.number,
              temperatura: cow.temperature,
              frecuenciaCardiaca: cow.heartRate,
              actividad: cow.activity,
              estado: cow.status,
              cercaAsignada: cow.fenceId || 'Ninguna'
            };
          } else {
            result = { encontrada: false, nombre_buscado: args.nombre_vaca };
          }
        } else {
          const cattle = await getCattle();
          result = {
            total: cattle.length,
            vacas: cattle.map(c => ({
              nombre: c.name,
              numero: c.number,
              estado: c.status,
              actividad: c.activity,
              temperatura: c.temperature
            }))
          };
        }
        break;
      }

      // ---- MOVER GANADO ----
      case 'mover_ganado': {
        const moveResult = await moveCowToFence(args.nombre_vaca, args.destino);
        result = moveResult;
        break;
      }

      // ---- CREAR CERCA ----
      case 'crear_cerca': {
        const fenceResult = await createFence(args.nombre);
        result = fenceResult;
        break;
      }

      // ---- CONSULTAR ALERTAS ----
      case 'consultar_alertas': {
        const alerts = await getRecentAlerts(args.cantidad || 5);
        result = {
          total: alerts.length,
          alertas: alerts.map(a => ({
            tipo: a.type,
            mensaje: a.message,
            timestamp: a.timestamp?.toDate?.()?.toLocaleString('es-CO') || 'Reciente'
          }))
        };
        break;
      }

      // ---- CONSULTAR CERCAS ----
      case 'consultar_cercas': {
        const fences = await getFences();
        result = {
          total: fences.length,
          cercas: fences.map(f => ({
            nombre: f.name,
            vacasAsignadas: f.cattleIds?.length || 0,
            color: f.color
          }))
        };
        break;
      }

      // ---- REGISTRAR VACA ----
      case 'registrar_vaca': {
        const newCow = await registerCow(args.nombre, args.numero);
        result = {
          success: true,
          nombre: newCow.name,
          numero: newCow.number
        };
        break;
      }

      // ---- ELIMINAR VACA ----
      case 'eliminar_vaca': {
        const deletedCow = await deleteCow(args.nombre);
        if (deletedCow) {
          result = { success: true, nombre: deletedCow.name };
        } else {
          result = { success: false, error: `No encontré una vaca llamada "${args.nombre}"` };
        }
        break;
      }

      // ---- RESUMEN FINCA ----
      case 'resumen_finca': {
        const summary = await getFarmSummary();
        result = {
          totalVacas: summary.totalCattle,
          totalCercas: summary.totalFences,
          seguras: summary.safe,
          alerta: summary.warning,
          fuera: summary.danger,
          ultimasAlertas: summary.recentAlerts.map(a => a.message).slice(0, 3)
        };
        break;
      }

      default:
        result = { error: 'Función no reconocida' };
    }

    // Step 3: Send function result back to Gemini for natural language response
    if (chat) {
      responseText = await sendFunctionResult(chat, functionName, result);
    }

    // If Gemini didn't generate a response, create a fallback
    if (!responseText) {
      responseText = formatFallbackResponse(functionName, result);
    }

    await bot.sendMessage(chatId, responseText, { parse_mode: 'Markdown' });

  } catch (error) {
    console.error(`Error executing ${functionName}:`, error);
    await bot.sendMessage(chatId,
      `⚠️ Error ejecutando la acción. Intenta de nuevo.\n_${error.message}_`,
      { parse_mode: 'Markdown' }
    );
  }
}

// ============================================
// FORMATTING HELPERS
// ============================================

function formatFarmSummary(summary) {
  let text = `📊 *Resumen de la Finca*\n\n`;
  text += `🐄 *Ganado:* ${summary.totalCattle} vacas\n`;
  text += `   ✅ Seguras: ${summary.safe}\n`;
  text += `   ⚠️ En alerta: ${summary.warning}\n`;
  text += `   🚨 Fuera de cerca: ${summary.danger}\n\n`;
  text += `🗺️ *Cercas:* ${summary.totalFences} zonas\n\n`;

  if (summary.recentAlerts.length > 0) {
    text += `🔔 *Últimas alertas:*\n`;
    summary.recentAlerts.forEach(a => {
      text += `• ${a.message}\n`;
    });
  } else {
    text += `🔔 Sin alertas recientes ✅`;
  }

  return text;
}

function formatFallbackResponse(functionName, result) {
  switch (functionName) {
    case 'consultar_ganado':
      if (result.encontrada === false) return `❌ No encontré a "${result.nombre_buscado}". Revisa el nombre.`;
      if (result.total !== undefined) return `🐄 Tienes ${result.total} vacas en el sistema.`;
      return `🐄 ${result.nombre} #${result.numero}: ${result.estado} | ${result.temperatura}°C | ${result.actividad}`;

    case 'mover_ganado':
      return result.success
        ? `✅ Listo, ${result.cow.name} fue movida a "${result.fence.name}"`
        : `❌ ${result.error}`;

    case 'crear_cerca':
      return result.success
        ? `✅ Cerca "${result.fence.name}" creada exitosamente`
        : `❌ ${result.error}`;

    case 'registrar_vaca':
      return result.success
        ? `✅ Vaca "${result.nombre}" #${result.numero} registrada`
        : `❌ Error registrando la vaca`;

    case 'eliminar_vaca':
      return result.success
        ? `✅ Vaca "${result.nombre}" eliminada del sistema`
        : `❌ ${result.error}`;

    case 'resumen_finca':
      return `📊 Finca: ${result.totalVacas} vacas | ${result.totalCercas} cercas | ✅${result.seguras} ⚠️${result.alerta} 🚨${result.fuera}`;

    default:
      return '✅ Acción completada.';
  }
}
