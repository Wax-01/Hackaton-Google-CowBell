// ============================================
// COWBELL BOT - Entry Point
// ============================================
// Bot de Telegram para gestión ganadera con IA
// Fricción Cero: el granjero habla normal, la IA ejecuta
// ============================================

import 'dotenv/config';
import TelegramBot from 'node-telegram-bot-api';
import {
  handleStart,
  handleHelp,
  handleStatus,
  handleTextMessage,
  handleVoiceMessage
} from './handlers.js';

// ============================================
// CONFIGURATION
// ============================================

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!TELEGRAM_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN no configurado en .env');
  process.exit(1);
}

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY no configurado en .env');
  process.exit(1);
}

// ============================================
// INITIALIZE BOT
// ============================================

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

console.log('');
console.log('  🐄 ================================');
console.log('  🔔 COWBELL - Centinela Agro Bot');
console.log('  🤖 IA + Telegram + Firebase');
console.log('  🐄 ================================');
console.log('');
console.log('  ✅ Bot activo y escuchando...');
console.log('  📱 t.me/CentinelaAgro_bot');
console.log('');

// ============================================
// COMMAND HANDLERS
// ============================================

bot.onText(/\/start/, (msg) => handleStart(bot, msg));
bot.onText(/\/ayuda/, (msg) => handleHelp(bot, msg));
bot.onText(/\/help/, (msg) => handleHelp(bot, msg));
bot.onText(/\/estado/, (msg) => handleStatus(bot, msg));

// ============================================
// TEXT MESSAGE HANDLER (Natural Language → AI)
// ============================================

bot.on('message', (msg) => {
  // Skip commands (already handled above)
  if (msg.text && msg.text.startsWith('/')) return;

  // Handle voice messages
  if (msg.voice || msg.audio) {
    handleVoiceMessage(bot, msg);
    return;
  }

  // Handle text messages
  if (msg.text) {
    handleTextMessage(bot, msg);
    return;
  }
});

// ============================================
// ERROR HANDLING
// ============================================

bot.on('polling_error', (error) => {
  console.error('❌ Polling error:', error.code, error.message);
});

bot.on('error', (error) => {
  console.error('❌ Bot error:', error.message);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando Centinela Bot...');
  bot.stopPolling();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n👋 Cerrando Centinela Bot...');
  bot.stopPolling();
  process.exit(0);
});
