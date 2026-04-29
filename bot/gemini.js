// ============================================
// COWBELL BOT - Gemini AI with Function Calling
// ============================================
// This is the "Efecto WOW" — AI as infrastructure, not as chatbot.
// Gemini translates natural farmer language into deterministic
// function calls that update Firebase instantly.
// ============================================

import { GoogleGenerativeAI } from '@google/generative-ai';
import { COW_NAMES } from './firebase.js';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ============================================
// FUNCTION DECLARATIONS — What Gemini can call
// ============================================

const functionDeclarations = [
  {
    name: 'consultar_ganado',
    description: 'Consultar el estado de todo el ganado o de una vaca específica. Usar cuando el usuario pregunta por sus vacas, su ganado, cómo están, etc.',
    parameters: {
      type: 'object',
      properties: {
        nombre_vaca: {
          type: 'string',
          description: 'Nombre de la vaca específica a consultar. Dejar vacío para consultar todas.'
        }
      }
    }
  },
  {
    name: 'mover_ganado',
    description: 'Mover una vaca o varias vacas a una cerca/zona/potrero diferente. Usar cuando el usuario dice cosas como "manda la vaca a zona B", "mueve a Lola al potrero norte", "pasa el ganado pa la zona 2".',
    parameters: {
      type: 'object',
      properties: {
        nombre_vaca: {
          type: 'string',
          description: 'Nombre de la vaca a mover'
        },
        destino: {
          type: 'string',
          description: 'Nombre de la cerca, zona o potrero de destino'
        }
      },
      required: ['nombre_vaca', 'destino']
    }
  },
  {
    name: 'crear_cerca',
    description: 'Crear una nueva cerca virtual, zona o potrero. Usar cuando el usuario dice "crea una nueva zona", "agrega un potrero", "nueva cerca".',
    parameters: {
      type: 'object',
      properties: {
        nombre: {
          type: 'string',
          description: 'Nombre para la nueva cerca/zona/potrero'
        }
      },
      required: ['nombre']
    }
  },
  {
    name: 'consultar_alertas',
    description: 'Consultar las alertas recientes del sistema. Usar cuando el usuario pregunta "¿hay alertas?", "¿qué ha pasado?", "¿alguna novedad?".',
    parameters: {
      type: 'object',
      properties: {
        cantidad: {
          type: 'number',
          description: 'Cantidad de alertas a mostrar (máximo 10, default 5)'
        }
      }
    }
  },
  {
    name: 'consultar_cercas',
    description: 'Listar todas las cercas/zonas/potreros existentes. Usar cuando el usuario pregunta "¿cuáles zonas tengo?", "muéstrame las cercas", "¿qué potreros hay?".',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'registrar_vaca',
    description: 'Registrar una nueva vaca en el sistema. Usar cuando el usuario dice "registra una vaca nueva", "agrega una vaca", "tengo una vaca nueva".',
    parameters: {
      type: 'object',
      properties: {
        nombre: {
          type: 'string',
          description: 'Nombre de la nueva vaca'
        },
        numero: {
          type: 'number',
          description: 'Número identificador de la vaca (opcional, se asigna automáticamente)'
        }
      },
      required: ['nombre']
    }
  },
  {
    name: 'eliminar_vaca',
    description: 'Eliminar una vaca del sistema. Usar cuando el usuario dice "elimina a la Lola", "quita esa vaca", "borra la vaca X".',
    parameters: {
      type: 'object',
      properties: {
        nombre: {
          type: 'string',
          description: 'Nombre de la vaca a eliminar'
        }
      },
      required: ['nombre']
    }
  },
  {
    name: 'resumen_finca',
    description: 'Obtener un resumen completo del estado de la finca. Usar cuando el usuario dice "¿cómo va todo?", "dame un resumen", "estado general", "¿qué tal la finca?".',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

// ============================================
// GEMINI MODEL CONFIGURATION
// ============================================

const cowNamesStr = COW_NAMES.map((n, i) => `${n} (#${i + 1})`).join(', ');

const model = genAI.getGenerativeModel({
  model: 'gemini-2.5-flash',
  systemInstruction: `Eres "Centinela", el asistente inteligente de CowBell, un sistema de cercas virtuales para ganadería.

REGLAS IMPORTANTES:
- Hablas como un asistente amigable y campechano, adaptado al lenguaje rural colombiano.
- Cuando el usuario pida una acción (mover ganado, crear cerca, etc.), SIEMPRE usa las funciones disponibles. NUNCA inventes datos.
- Si no entiendes qué quiere el usuario, pregunta amablemente.
- Usa emojis de forma natural (🐄 🗺️ ✅ ⚠️ 🔔).
- Sé breve y directo en las respuestas, los granjeros están ocupados.
- Si el usuario manda un audio, interpreta su intención como si fuera texto.
- Cuando reportes temperaturas, usa °C. Frecuencia cardíaca en bpm.
- Los potreros, zonas y cercas son sinónimos.

CONTEXTO DEL SISTEMA:
- CowBell monitorea ganado con GPS y sensores virtuales.
- Cada vaca tiene: nombre, número, temperatura, frecuencia cardíaca, actividad, estado (normal/alerta/fuera), y una cerca asignada.
- Las cercas son zonas geográficas donde el ganado debe permanecer.
- Se generan alertas cuando una vaca sale de su cerca o se acerca al límite.

VACAS REGISTRADAS EN EL SISTEMA:
${cowNamesStr}

Cuando el usuario pregunte por una vaca, SIEMPRE usa la función consultar_ganado para obtener los datos reales. Si el nombre que da el usuario es parcial o tiene errores, intenta asociarlo a una de las vacas registradas arriba. Por ejemplo "la Loli" → "Lola", "la Mari" → "Mariposa", etc.`,
  tools: [{ functionDeclarations }]
});

// ============================================
// PROCESS MESSAGE — Send to Gemini, get function call
// ============================================

/**
 * Process a text message through Gemini and return the function call + text response
 */
export async function processMessage(text) {
  try {
    const chat = model.startChat();
    const result = await chat.sendMessage(text);
    const response = result.response;

    // Check if Gemini wants to call a function
    const candidate = response.candidates?.[0];
    const parts = candidate?.content?.parts || [];

    for (const part of parts) {
      if (part.functionCall) {
        return {
          type: 'function_call',
          functionName: part.functionCall.name,
          args: part.functionCall.args || {},
          chat // Return chat for follow-up
        };
      }
    }

    // If no function call, return the text response
    const textResponse = response.text();
    return {
      type: 'text',
      text: textResponse
    };
  } catch (error) {
    console.error('Gemini error:', error);
    return {
      type: 'error',
      text: '⚠️ Ups, tuve un problema procesando tu mensaje. Intenta de nuevo.'
    };
  }
}

/**
 * Send function result back to Gemini to get a natural language response
 */
export async function sendFunctionResult(chat, functionName, result) {
  try {
    const followUp = await chat.sendMessage([
      {
        functionResponse: {
          name: functionName,
          response: { result }
        }
      }
    ]);
    return followUp.response.text();
  } catch (error) {
    console.error('Error sending function result:', error);
    return null;
  }
}

/**
 * Process an audio file (voice note) through Gemini
 */
export async function processAudio(audioBuffer, mimeType = 'audio/ogg') {
  try {
    const audioModel = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `Eres "Centinela", el asistente de CowBell para ganadería. El usuario te envía un audio con instrucciones sobre su ganado. Escucha y extrae su intención. Responde SOLO con el texto de lo que dijo el usuario, sin agregar nada más. Si no entiendes, di "no_entendido".`,
    });

    const result = await audioModel.generateContent([
      {
        inlineData: {
          mimeType,
          data: audioBuffer.toString('base64')
        }
      },
      'Transcribe exactamente lo que dice el usuario en este audio.'
    ]);

    const transcription = result.response.text().trim();
    console.log('🎤 Transcripción:', transcription);

    if (transcription === 'no_entendido' || transcription.length < 3) {
      return {
        type: 'text',
        text: '🎤 No logré entender el audio. ¿Podrías repetirlo o escribirme?'
      };
    }

    // Now process the transcription as a normal text message
    return await processMessage(transcription);
  } catch (error) {
    console.error('Audio processing error:', error);
    return {
      type: 'error',
      text: '⚠️ No pude procesar el audio. Intenta escribirme en texto.'
    };
  }
}
