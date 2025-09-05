const { default: makeWASocket, DisconnectReason, useMultiFileAuthState, ButtonsMessage } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs').promises;
const path = require('path');
const ytdl = require('ytdl-core');
const { exec } = require('child_process');
const fetch = require('node-fetch');

const logger = P({ level: 'silent' });
const BOT_NAME = 'Kaizen';
const BOT_ALIAS = 'Broken Vzn AI';
const startTime = Date.now();

const CONFIG = {
    MENU_TIMEOUT: 5 * 60 * 1000,
    BACKUP_INTERVAL: 30 * 60 * 1000,
    DATA_DIR: path.join(__dirname, 'data'),
    OWNER_NUMBER: '2348088866878',
    OWNER_ALT_ID: '211532071870561',
    ADMIN_NUMBERS: ['2348088866878', '2349057938488']
};

let botData = {
    features: { stockCount: true, creativeHub: true, gamesArena: true, utilityCenter: true, analyticsPanel: true, funZone: true, masterSwitch: true, groupCommands: true, youtubeCommands: true },
    reactionCounters: {},
    userSessions: {},
    gameData: { leaderboards: { global: {}, groups: {} }, activeGames: {} },
    analytics: { commandUsage: {}, userActivity: {}, groupStats: {} },
    groupData: { settings: {}, tags: {} }
};

async function initializeDataSystem() {
    try {
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        await loadAllData();
        setInterval(backupData, CONFIG.BACKUP_INTERVAL);
        console.log(`📊 ${BOT_NAME} Data system initialized`);
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Data system init failed:`, error);
    }
}

async function loadAllData() {
    const files = ['features.json', 'reactionCounters.json', 'userSessions.json', 'gameData.json', 'analytics.json', 'groupData.json'];
    for (const file of files) {
        try {
            const data = await fs.readFile(path.join(CONFIG.DATA_DIR, file), 'utf8');
            const key = file.replace('.json', '');
            if (key === 'features') botData.features = { ...botData.features, ...JSON.parse(data) };
            else botData[key] = JSON.parse(data);
        } catch (error) {
            console.log(`📁 ${file} using defaults`);
        }
    }
}

async function saveData(type) {
    try {
        await fs.writeFile(path.join(CONFIG.DATA_DIR, `${type}.json`), JSON.stringify(botData[type], null, 2));
    } catch (error) {
        console.error(`❌ Save ${type} failed:`, error);
    }
}

async function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(CONFIG.DATA_DIR, 'backups', timestamp);
    try {
        await fs.mkdir(backupDir, { recursive: true });
        for (const [key, data] of Object.entries(botData)) {
            if (typeof data === 'object') {
                await fs.writeFile(path.join(backupDir, `${key}.json`), JSON.stringify(data, null, 2));
            }
        }
        console.log(`💾 ${BOT_NAME} Backup completed`);
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Backup failed:`, error);
    }
}

function extractPhoneNumber(jid) {
    if (!jid) return null;
    return jid.split('@')[0].split('-')[0];
}

function isOwner(jid) {
    if (!jid) return false;
    const phoneNumber = extractPhoneNumber(jid);
    return phoneNumber === CONFIG.OWNER_NUMBER || phoneNumber === CONFIG.OWNER_ALT_ID || jid.includes(CONFIG.OWNER_ALT_ID);
}

function isAdmin(jid) {
    const phoneNumber = extractPhoneNumber(jid);
    return CONFIG.ADMIN_NUMBERS.includes(phoneNumber) || isOwner(jid);
}

function isGroupAdmin(sock, jid, userJid) {
    return isAdmin(userJid) || isOwner(userJid);
}

function hasFeatureAccess(feature) {
    return botData.features.masterSwitch && botData.features[feature];
}

function getUserSession(jid) {
    if (!botData.userSessions[jid]) {
        botData.userSessions[jid] = { currentMenu: 'main', lastActivity: Date.now(), breadcrumb: [], notes: [], aiMode: false };
    }
    return botData.userSessions[jid];
}

function updateUserSession(jid, menu, action = 'navigate') {
    const session = getUserSession(jid);
    if (action === 'navigate') {
        if (menu !== session.currentMenu) session.breadcrumb.push(session.currentMenu);
        session.currentMenu = menu;
    } else if (action === 'back') {
        session.currentMenu = session.breadcrumb.pop() || 'main';
        session.aiMode = false;
    }
    session.lastActivity = Date.now();
    saveData('userSessions');
}

function checkSessionTimeout(jid) {
    const session = getUserSession(jid);
    const timeDiff = Date.now() - session.lastActivity;
    if (timeDiff > CONFIG.MENU_TIMEOUT) {
        session.currentMenu = 'main';
        session.breadcrumb = [];
        session.aiMode = false;
        return true;
    }
    return false;
}

function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    return `${days ? days + 'd ' : ''}${hours % 24 ? hours % 24 + 'h ' : ''}${minutes % 60}m ${seconds % 60}s`;
}

function renderMenu(menuName, userJid) {
    const isAdminUser = isAdmin(userJid);
    const isOwnerUser = isOwner(userJid);
    
    const menus = {
        main: {
            text: `🌟 *Welcome to ${BOT_NAME} (${BOT_ALIAS})* 🌟\n\n` +
                  `✨ Explore the Ultimate WhatsApp Experience ✨\n` +
                  `📌 Select an option below:\n\n` +
                  `🎨 Creative Hub\n` +
                  `🎮 Games Arena\n` +
                  `🛠️ Utility Center\n` +
                  `📊 Analytics Dashboard\n` +
                  `🎭 Fun Zone\n` +
                  `👥 Group Tools\n` +
                  `📺 YouTube Tools\n` +
                  (isAdminUser ? `👑 Admin Panel\n` : '') +
                  `❓ Help Center\n\n` +
                  `💡 *Tip*: Use .menu or buttons to navigate!`,
            buttons: [
                { buttonId: 'main:creative', buttonText: { displayText: '🎨 Creative Hub' }, type: 1 },
                { buttonId: 'main:games', buttonText: { displayText: '🎮 Games Arena' }, type: 1 },
                { buttonId: 'main:utility', buttonText: { displayText: '🛠️ Utility Center' }, type: 1 },
                { buttonId: 'main:analytics', buttonText: { displayText: '📊 Analytics' }, type: 1 },
                { buttonId: 'main:fun', buttonText: { displayText: '🎭 Fun Zone' }, type: 1 },
                { buttonId: 'main:group', buttonText: { displayText: '👥 Group Tools' }, type: 1 },
                { buttonId: 'main:youtube', buttonText: { displayText: '📺 YouTube Tools' }, type: 1 },
                ...(isAdminUser ? [{ buttonId: 'main:admin', buttonText: { displayText: '👑 Admin Panel' }, type: 1 }] : []),
                { buttonId: 'main:help', buttonText: { displayText: '❓ Help Center' }, type: 1 }
            ]
        },
        creative: {
            text: `🎨 *${BOT_NAME} Creative Hub* 🎨\n\n` +
                  `Unleash your creativity! Choose an option:\n\n` +
                  `✨ ASCII Art Generator\n` +
                  `🖼️ Image to ASCII\n` +
                  `🤖 AI Chat\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'creative:ascii', buttonText: { displayText: '✨ ASCII Art' }, type: 1 },
                { buttonId: 'creative:image', buttonText: { displayText: '🖼️ Image→ASCII' }, type: 1 },
                { buttonId: 'creative:ai', buttonText: { displayText: '🤖 AI Chat' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        games: {
            text: `🎮 *${BOT_NAME} Games Arena* 🎮\n\n` +
                  `Ready to play? Pick a game:\n\n` +
                  `✂️ Rock Paper Scissors\n` +
                  `🔢 Number Guessing\n` +
                  `🧠 Trivia Challenge\n` +
                  `🎯 Emoji Riddle\n` +
                  `🔤 Word Scramble\n` +
                  `🏆 Leaderboards\n` +
                  (isAdminUser ? `⚙️ Game Admin\n` : '') +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'games:rps', buttonText: { displayText: '✂️ Rock Paper' }, type: 1 },
                { buttonId: 'games:guess', buttonText: { displayText: '🔢 Number Guess' }, type: 1 },
                { buttonId: 'games:trivia', buttonText: { displayText: '🧠 Trivia' }, type: 1 },
                { buttonId: 'games:riddle', buttonText: { displayText: '🎯 Emoji Riddle' }, type: 1 },
                { buttonId: 'games:scramble', buttonText: { displayText: '🔤 Word Scramble' }, type: 1 },
                { buttonId: 'games:leaderboard', buttonText: { displayText: '🏆 Leaderboards' }, type: 1 },
                ...(isAdminUser ? [{ buttonId: 'games:admin', buttonText: { displayText: '⚙️ Game Admin' }, type: 1 }] : []),
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        utility: {
            text: `🛠️ *${BOT_NAME} Utility Center* 🛠️\n\n` +
                  `Useful tools at your fingertips:\n\n` +
                  `📅 Reminders\n` +
                  `📝 Notes\n` +
                  `🔢 Calculator\n` +
                  `🌐 Translator\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'utility:remind', buttonText: { displayText: '📅 Reminders' }, type: 1 },
                { buttonId: 'utility:note', buttonText: { displayText: '📝 Notes' }, type: 1 },
                { buttonId: 'utility:calc', buttonText: { displayText: '🔢 Calculator' }, type: 1 },
                { buttonId: 'utility:translate', buttonText: { displayText: '🌐 Translator' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        group: {
            text: `👥 *${BOT_NAME} Group Tools* 👥\n\n` +
                  `Manage your group like a pro:\n\n` +
                  `📢 Announce\n` +
                  `🏷️ Tag All\n` +
                  `🔒 Group Lock\n` +
                  `🔓 Group Unlock\n` +
                  `👋 Kick User\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'group:announce', buttonText: { displayText: '📢 Announce' }, type: 1 },
                { buttonId: 'group:tagall', buttonText: { displayText: '🏷️ Tag All' }, type: 1 },
                { buttonId: 'group:lock', buttonText: { displayText: '🔒 Group Lock' }, type: 1 },
                { buttonId: 'group:unlock', buttonText: { displayText: '🔓 Group Unlock' }, type: 1 },
                { buttonId: 'group:kick', buttonText: { displayText: '👋 Kick User' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        youtube: {
            text: `📺 *${BOT_NAME} YouTube Tools* 📺\n\n` +
                  `Explore YouTube features:\n\n` +
                  `🔍 Search Videos\n` +
                  `🎥 Video Info\n` +
                  `🎵 Audio Info\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'youtube:search', buttonText: { displayText: '🔍 Search Video' }, type: 1 },
                { buttonId: 'youtube:video', buttonText: { displayText: '🎥 Video Info' }, type: 1 },
                { buttonId: 'youtube:audio', buttonText: { displayText: '🎵 Audio Info' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        admin: {
            text: `👑 *${BOT_NAME} Admin Panel* 👑\n\n` +
                  `Control the bot's core:\n\n` +
                  `👥 User Management\n` +
                  `⚙️ Feature Settings\n` +
                  `🎮 Game Management\n` +
                  (isOwnerUser ? `📊 Stock Count Toggle\n` : '') +
                  (isOwnerUser ? `🔧 Owner Tools\n` : '') +
                  `🔴 Kill Switch\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'admin:users', buttonText: { displayText: '👥 User Mgmt' }, type: 1 },
                { buttonId: 'admin:features', buttonText: { displayText: '⚙️ Features' }, type: 1 },
                { buttonId: 'admin:games', buttonText: { displayText: '🎮 Game Mgmt' }, type: 1 },
                ...(isOwnerUser ? [
                    { buttonId: 'admin:stock', buttonText: { displayText: '📊 Stock Toggle' }, type: 1 },
                    { buttonId: 'admin:owner', buttonText: { displayText: '🔧 Owner Tools' }, type: 1 }
                ] : []),
                { buttonId: 'admin:kill', buttonText: { displayText: '🔴 Kill Switch' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        },
        owner: {
            text: `🔧 *${BOT_NAME} Owner Tools* 🔧\n\n` +
                  `Ultimate control panel:\n\n` +
                  `📢 Broadcast\n` +
                  `🔄 Restart Bot\n` +
                  `🛡️ Add Admin\n` +
                  `🗑️ Clear Data\n\n` +
                  `🔙 *Back*: .back | 🏠 *Home*: .menu`,
            buttons: [
                { buttonId: 'owner:broadcast', buttonText: { displayText: '📢 Broadcast' }, type: 1 },
                { buttonId: 'owner:restart', buttonText: { displayText: '🔄 Restart Bot' }, type: 1 },
                { buttonId: 'owner:addadmin', buttonText: { displayText: '🛡️ Add Admin' }, type: 1 },
                { buttonId: 'owner:cleardata', buttonText: { displayText: '🗑️ Clear Data' }, type: 1 },
                { buttonId: 'back', buttonText: { displayText: '🔙 Back' }, type: 1 },
                { buttonId: 'menu', buttonText: { displayText: '🏠 Home' }, type: 1 }
            ]
        }
    };
    
    return menus[menuName] || menus.main;
}

function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendMessageWithDelay(sock, jid, content, minDelay = 1000, maxDelay = 3000) {
    const delay = getRandomDelay(minDelay, maxDelay);
    setTimeout(async () => {
        try {
            if (content.buttons) {
                await sock.sendMessage(jid, {
                    text: content.text,
                    footer: `Powered by ${BOT_NAME} (${BOT_ALIAS})`,
                    buttons: content.buttons,
                    headerType: 1
                });
            } else {
                await sock.sendMessage(jid, content);
            }
        } catch (error) {
            console.error(`❌ ${BOT_NAME} Send error:`, error);
        }
    }, delay);
}

function isStockCountMessage(text) {
    return text && text.toLowerCase().includes('new stock count');
}

function getMessageKey(msg) {
    return `${msg.key.remoteJid}_${msg.key.id}`;
}

async function handleStockCountReaction(sock, msg) {
    if (!hasFeatureAccess('stockCount')) return;
    try {
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '👍', key: msg.key } });
        const msgKey = getMessageKey(msg);
        if (!botData.reactionCounters[msgKey]) {
            botData.reactionCounters[msgKey] = { count: 0, hasReplied: false, messageText: 'Stock count message' };
            await saveData('reactionCounters');
        }
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Stock reaction error:`, error);
    }
}

// ASCII Art Generator
function generateASCIIArt(text) {
    const chars = { 
        'A': '  █████  \n ██   ██ \n ███████ \n ██   ██ \n ██   ██ ', 
        'B': ' ██████  \n ██   ██ \n ██████  \n ██   ██ \n ██████  ', 
        'C': '  ██████ \n ██      \n ██      \n ██      \n  ██████ ', 
        'D': ' ██████  \n ██   ██ \n ██   ██ \n ██   ██ \n ██████  ',
        'E': ' ███████ \n ██      \n █████   \n ██      \n ███████ ', 
        'F': ' ███████ \n ██      \n █████   \n ██      \n ██      ',
        'G': '  ██████ \n ██      \n ██  ███ \n ██   ██ \n  ██████ ', 
        'H': ' ██   ██ \n ██   ██ \n ███████ \n ██   ██ \n ██   ██ ',
        'I': ' ██ \n ██ \n ██ \n ██ \n ██ ', 
        'O': '  ██████ \n ██    ██\n ██    ██\n ██    ██\n  ██████ ',
        'L': ' ██      \n ██      \n ██      \n ██      \n ███████ ', 
        'R': ' ██████  \n ██   ██ \n ██████  \n ██   ██ \n ██   ██ ',
        'T': ' ███████ \n    ██   \n    ██   \n    ██   \n    ██   ', 
        'S': '  ██████ \n ██      \n  █████  \n      ██ \n ██████  ' 
    };
    
    return text.toUpperCase().split('').map(char => chars[char] || '   ???   ').join('  ');
}

// Utility Functions
function calculate(expression) {
    try {
        return eval(expression).toString();
    } catch {
        return '❌ Invalid calculation';
    }
}

async function translateText(text, targetLang = 'en') {
    try {
        const response = await fetch('https://libretranslate.de/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, source: 'auto', target: targetLang })
        });
        const data = await response.json();
        return data.translatedText || '❌ Translation failed';
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Translation error:`, error);
        return '⚠️ Translation service unavailable. Try again later!';
    }
}

// YouTube Functions
async function searchYouTube(query) {
    try {
        return new Promise((resolve, reject) => {
            exec(`yt-dlp "ytsearch5:${query}" --dump-json`, (err, stdout) => {
                if (err) return reject(err);
                const results = stdout.split('\n').filter(line => line).map(JSON.parse);
                resolve(results.map(r => ({ title: r.title, url: r.webpage_url })));
            });
        });
    } catch (error) {
        console.error(`❌ ${BOT_NAME} YouTube search error:`, error);
        return [];
    }
}

async function getVideoInfo(videoUrl) {
    try {
        const info = await ytdl.getInfo(videoUrl);
        return {
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            views: info.videoDetails.viewCount,
            likes: info.videoDetails.likes,
            url: info.videoDetails.video_url
        };
    } catch (error) {
        console.error(`❌ ${BOT_NAME} YouTube video info error:`, error);
        return null;
    }
}

async function getAudioInfo(videoUrl) {
    try {
        const info = await ytdl.getInfo(videoUrl);
        const audioFormat = ytdl.filterFormats(info.formats, 'audioonly')[0];
        if (!audioFormat) return null;
        return {
            title: info.videoDetails.title,
            duration: info.videoDetails.lengthSeconds,
            bitrate: audioFormat.audioBitrate,
            url: info.videoDetails.video_url
        };
    } catch (error) {
        console.error(`❌ ${BOT_NAME} YouTube audio info error:`, error);
        return null;
    }
}

// API Functions
async function getRandomJoke() {
    try {
        const response = await fetch('https://v2.jokeapi.dev/joke/Any?safe-mode');
        const data = await response.json();
        if (data.type === 'single') {
            return data.joke;
        } else {
            return `${data.setup}\n\n${data.delivery}`;
        }
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Joke API error:`, error);
        return '⚠️ Could not fetch a joke. Try again later!';
    }
}

async function getRandomFact() {
    try {
        const response = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await response.json();
        return data.text;
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Fact API error:`, error);
        return '⚠️ Could not fetch a fact. Try again later!';
    }
}

async function getRandomQuote() {
    try {
        const response = await fetch('https://api.quotable.io/random');
        const data = await response.json();
        return `*${data.content}*\n— _${data.author}_`;
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Quote API error:`, error);
        return '⚠️ Could not fetch a quote. Try again later!';
    }
}

async function getAIResponse(query) {
    try {
        const response = await fetch(`https://ab-blackboxai.abrahamdw882.workers.dev/?q=${encodeURIComponent(query)}`);
        const text = await response.text();
        return text || '⚠️ AI response is empty. Try a different query!';
    } catch (error) {
        console.error(`❌ ${BOT_NAME} AI API error:`, error);
        return '⚠️ AI service unavailable. Try again later!';
    }
}

// Games
let activeGames = {};

function startRockPaperScissors(chatId) {
    activeGames[chatId] = { type: 'rps', players: {}, scores: {} };
    return '✂️ *ROCK PAPER SCISSORS!* 🎮\n\nReply with: rock, paper, or scissors\n🚀 Game started!';
}

function playRPS(choice, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'rps') return '❌ No active RPS game. Start one with Games Arena!';
    
    const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    const playerChoice = choice.toLowerCase();
    
    let result = '';
    if (playerChoice === botChoice) result = '🤝 *It’s a TIE!*';
    else if ((playerChoice === 'rock' && botChoice === 'scissors') || 
             (playerChoice === 'paper' && botChoice === 'rock') || 
             (playerChoice === 'scissors' && botChoice === 'paper')) {
        result = '🏆 *YOU WIN!*';
        game.scores[playerId] = (game.scores[playerId] || 0) + 1;
    } else result = '💀 *YOU LOSE!*';
    
    return `🎮 *RPS Battle*\n\nYou: ${playerChoice} | ${BOT_NAME}: ${botChoice}\n${result}\n📊 Score: ${game.scores[playerId] || 0}\n\nPlay again!';
}

function startNumberGuess(chatId) {
    const number = Math.floor(Math.random() * 100) + 1;
    activeGames[chatId] = { type: 'guess', number, attempts: 7, players: {} };
    return '🔢 *NUMBER GUESSING GAME!* 🎲\n\nI\'m thinking of a number 1-100\nYou have 7 attempts!\n\nGuess a number!';
}

function playNumberGuess(guess, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'guess') return '❌ No active number game. Start one with Games Arena!';
    
    const num = parseInt(guess);
    if (isNaN(num) || num < 1 || num > 100) return '❌ Enter a number between 1-100!';
    
    game.attempts--;
    
    if (num === game.number) {
        delete activeGames[chatId];
        return `🎉 *CORRECT!* The number was ${game.number}!\n🏆 You won with ${7 - game.attempts} attempts!\n\nStart a new game in Games Arena!`;
    } else if (game.attempts <= 0) {
        delete activeGames[chatId];
        return `💀 *Game Over!* The number was ${game.number}.\n\nTry again in Games Arena!`;
    } else {
        const hint = num > game.number ? '📉 *Too high!*' : '📈 *Too low!*';
        return `${hint}\n🎯 Attempts left: ${game.attempts}\n\nGuess again!`;
    }
}

const triviaQuestions = [
    { q: 'What is the capital of France?', a: 'paris', options: 'A) London B) Berlin C) Paris D) Madrid' },
    { q: 'How many continents are there?', a: '7', options: 'A) 5 B) 6 C) 7 D) 8' },
    { q: 'What is 2+2?', a: '4', options: 'A) 3 B) 4 C) 5 D) 6' },
    { q: 'Largest planet in our solar system?', a: 'jupiter', options: 'A) Earth B) Mars C) Jupiter D) Saturn' }
];

function startTrivia(chatId) {
    const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    activeGames[chatId] = { type: 'trivia', question, scores: {} };
    return `🧠 *TRIVIA TIME!* 🤓\n\n❓ ${question.q}\n\n${question.options}\n\nType your answer!`;
}

function playTrivia(answer, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'trivia') return '❌ No active trivia. Start one in Games Arena!';
    
    if (answer.toLowerCase().includes(game.question.a.toLowerCase())) {
        game.scores[playerId] = (game.scores[playerId] || 0) + 1;
        return `🏆 *CORRECT!* Answer: ${game.question.a}\n📊 Your score: ${game.scores[playerId]}\n\nTry another in Games Arena!`;
    } else {
        return `❌ *Wrong!* Correct answer: ${game.question.a}\n\nTry another in Games Arena!`;
    }
}

async function handleButtonInteraction(sock, msg, buttonId) {
    const jid = msg.key.remoteJid;
    const userJid = msg.key.participant || jid;
    
    if (checkSessionTimeout(userJid)) {
        await sendMessageWithDelay(sock, jid, { text: `⏰ *Session Timeout!* Back to main menu. 🏠` });
        updateUserSession(userJid, 'main');
        await sendMessageWithDelay(sock, jid, renderMenu('main', userJid));
        return;
    }
    
    const [menu, action] = buttonId.split(':');
    
    if (buttonId === 'back') {
        updateUserSession(userJid, '', 'back');
        await sendMessageWithDelay(sock, jid, renderMenu(getUserSession(userJid).currentMenu, userJid));
        return;
    } else if (buttonId === 'menu') {
        updateUserSession(userJid, 'main');
        await sendMessageWithDelay(sock, jid, renderMenu('main', userJid));
        return;
    }
    
    await handleMenuNavigation(sock, jid, userJid, menu, action);
}

async function processCommand(sock, msg, command, args) {
    const jid = msg.key.remoteJid;
    const userJid = msg.key.participant || jid;
    
    try {
        if (checkSessionTimeout(userJid)) {
            await sendMessageWithDelay(sock, jid, { text: `⏰ *Session Timeout!* Back to main menu. 🏠` });
            updateUserSession(userJid, 'main');
            await sendMessageWithDelay(sock, jid, renderMenu('main', userJid));
            return;
        }
        
        const session = getUserSession(userJid);
        
        switch (command) {
            case 'menu': case 'home':
                updateUserSession(userJid, 'main');
                await sendMessageWithDelay(sock, jid, renderMenu('main', userJid));
                return;
            case 'back':
                updateUserSession(userJid, '', 'back');
                await sendMessageWithDelay(sock, jid, renderMenu(getUserSession(userJid).currentMenu, userJid));
                return;
            case 'admin':
                if (!isAdmin(userJid)) return;
                updateUserSession(userJid, 'admin');
                await sendMessageWithDelay(sock, jid, renderMenu('admin', userJid));
                return;
            case 'debug':
                if (!isAdmin(userJid)) return;
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔍 *${BOT_NAME} Debug Info* 🔍\n\n` +
                          `📞 *Number*: ${extractPhoneNumber(userJid)}\n` +
                          `👑 *Owner*: ${isOwner(userJid) ? 'Yes' : 'No'}\n` +
                          `🛡️ *Admin*: ${isAdmin(userJid) ? 'Yes' : 'No'}\n` +
                          `🆔 *JID*: ${userJid}\n\n` +
                          `💡 Type .menu for more!` 
                });
                return;
            case 'ping':
                const latency = Date.now() - (msg.messageTimestamp * 1000 || Date.now());
                const uptime = formatUptime(Date.now() - startTime);
                await sendMessageWithDelay(sock, jid, { 
                    text: `🏓 *PONG!* ${BOT_NAME} (${BOT_ALIAS}) is LIVE! 🚀\n\n` +
                          `⚡ *Latency*: ${latency}ms\n` +
                          `🕒 *Uptime*: ${uptime}\n` +
                          `🟢 *Status*: Online and kicking!\n` +
                          `🌟 *Fun Fact*: I'm ready to assist 24/7!\n\n` +
                          `💡 Try .menu for more commands!` 
                });
                return;
            case 'joke':
                const joke = await getRandomJoke();
                await sendMessageWithDelay(sock, jid, { 
                    text: `😂 *${BOT_NAME}'s Joke Time!* 🎉\n\n${joke}\n\n` +
                          `😄 Want another laugh? Type .joke!` 
                });
                return;
            case 'fact':
                const fact = await getRandomFact();
                await sendMessageWithDelay(sock, jid, { 
                    text: `🤓 *${BOT_NAME}'s Fun Fact!* 🌟\n\n${fact}\n\n` +
                          `🧠 Curious for more? Type .fact!` 
                });
                return;
            case 'quote':
                const quote = await getRandomQuote();
                await sendMessageWithDelay(sock, jid, { 
                    text: `💬 *${BOT_NAME}'s Inspirational Quote* ✨\n\n${quote}\n\n` +
                          `🌈 Feeling inspired? Type .quote for more!` 
                });
                return;
            case 'ai':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🤖 *${BOT_NAME}'s AI Chat* 🤖\n\n` +
                          `Please provide a query! Example: .ai What's the weather like?` 
                });
                const aiResponse = await getAIResponse(args.join(' '));
                await sendMessageWithDelay(sock, jid, { 
                    text: `🤖 *${BOT_NAME}'s AI Response* 🤖\n\n${aiResponse}\n\n` +
                          `💡 Ask another question with .ai [query]!` 
                });
                return;
            case 'announce':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                if (!args.length) return await sendMessageWithDelay(sock, jid, { 
                    text: `📢 *${BOT_NAME} Announcement* 📢\n\nPlease provide a message to announce!` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `📢 *GROUP ANNOUNCEMENT* 📢\n\n${args.join(' ')}\n\n` +
                          `— Sent by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'tagall':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.tags[jid] = botData.groupData.tags[jid] || [];
                await sendMessageWithDelay(sock, jid, { 
                    text: `🏷️ *${BOT_NAME} Tag All* 🏷️\n\n${botData.groupData.tags[jid].join(', ') || 'No members tagged'}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'lockgroup':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.settings[jid] = { ...botData.groupData.settings[jid], locked: true };
                await saveData('groupData');
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔒 *Group Locked!* 🔒\n\nGroup is now restricted.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'unlockgroup':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.settings[jid] = { ...botData.groupData.settings[jid], locked: false };
                await saveData('groupData');
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔓 *Group Unlocked!* 🔓\n\nGroup is now open.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'kick':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `👋 *${BOT_NAME} Kick User* 👋\n\nPlease provide a user to kick!` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `👋 *Kicked User*: ${args[0]}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'broadcast':
                if (!isOwner(userJid)) return;
                if (!args.length) return await sendMessageWithDelay(sock, jid, { 
                    text: `📢 *${BOT_NAME} Broadcast* 📢\n\nPlease provide a broadcast message!` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `📢 *Broadcast Sent*: ${args.join(' ')}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'restart':
                if (!isOwner(userJid)) return;
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔄 *${BOT_NAME} Restarting...* 🔄\n\nSee you in a moment!\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                process.exit(0);
                return;
            case 'addadmin':
                if (!isOwner(userJid)) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🛡️ *${BOT_NAME} Add Admin* 🛡️\n\nPlease provide a phone number to add as admin!` 
                });
                CONFIG.ADMIN_NUMBERS.push(args[0]);
                await sendMessageWithDelay(sock, jid, { 
                    text: `🛡️ *Admin Added*: ${args[0]}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'cleardata':
                if (!isOwner(userJid)) return;
                botData = { ...botData, reactionCounters: {}, userSessions: {}, gameData: { leaderboards: { global: {}, groups: {} }, activeGames: {} } };
                await saveData('reactionCounters');
                await saveData('userSessions');
                await saveData('gameData');
                await sendMessageWithDelay(sock, jid, { 
                    text: `🗑️ *${BOT_NAME} Data Cleared!* 🗑️\n\nBot data has been reset.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'remind':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `📅 *${BOT_NAME} Reminders* 📅\n\nPlease provide time and message! Example: .remind 1h Meeting` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `📅 *Reminder Set*: ${args.join(' ')}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'note':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `📝 *${BOT_NAME} Notes* 📝\n\nPlease provide note content! Example: .note Buy groceries` 
                });
                botData.userSessions[userJid].notes = botData.userSessions[userJid].notes || [];
                botData.userSessions[userJid].notes.push(args.join(' '));
                await saveData('userSessions');
                await sendMessageWithDelay(sock, jid, { 
                    text: `📝 *Note Saved*: ${args.join(' ')}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'calc':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🔢 *${BOT_NAME} Calculator* 🔢\n\nPlease provide a calculation! Example: .calc 2+2` 
                });
                const result = calculate(args.join(' '));
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔢 *Calculation Result* 🔢\n\n${result}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'translate':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🌐 *${BOT_NAME} Translator* 🌐\n\nPlease provide text to translate! Example: .translate es Hello` 
                });
                let targetLang = 'en';
                let translateArgs = args;
                if (args.length > 1 && args[0].length === 2) {
                    targetLang = args[0];
                    translateArgs = args.slice(1);
                }
                const translation = await translateText(translateArgs.join(' '), targetLang);
                await sendMessageWithDelay(sock, jid, { 
                    text: `🌐 *Translation to ${targetLang.toUpperCase()}* 🌐\n\n${translation}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'ytsearch':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🔍 *${BOT_NAME} YouTube Search* 🔍\n\nPlease provide a search query! Example: .ytsearch funny cats` 
                });
                const results = await searchYouTube(args.join(' '));
                if (!results.length) return await sendMessageWithDelay(sock, jid, { 
                    text: `🔍 *YouTube Search Failed* 🔍\n\nNo results found or yt-dlp not installed.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                const resultText = results.map((r, i) => `${i + 1}. *${r.title}*\n🔗 ${r.url}`).join('\n\n');
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔍 *YouTube Search Results* 🔍\n\n${resultText}\n\n` +
                          `💡 Use .ytvideo [url] for details!\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'ytvideo':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎥 *${BOT_NAME} Video Info* 🎥\n\nPlease provide a YouTube video URL!` 
                });
                if (!ytdl.validateURL(args[0])) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎥 *Invalid URL!* 🎥\n\nPlease provide a valid YouTube URL.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                const videoInfo = await getVideoInfo(args[0]);
                if (!videoInfo) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎥 *Video Not Found!* 🎥\n\nTry another URL.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `🎥 *${videoInfo.title}* 🎥\n\n` +
                          `👀 *Views*: ${videoInfo.views}\n` +
                          `⏱️ *Duration*: ${Math.floor(videoInfo.duration / 60)}m ${videoInfo.duration % 60}s\n` +
                          `🔗 *URL*: ${videoInfo.url}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
            case 'ytaudio':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎵 *${BOT_NAME} Audio Info* 🎵\n\nPlease provide a YouTube video URL!` 
                });
                if (!ytdl.validateURL(args[0])) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎵 *Invalid URL!* 🎵\n\nPlease provide a valid YouTube URL.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                const audioInfo = await getAudioInfo(args[0]);
                if (!audioInfo) return await sendMessageWithDelay(sock, jid, { 
                    text: `🎵 *Audio Not Found!* 🎵\n\nTry another URL.\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                await sendMessageWithDelay(sock, jid, { 
                    text: `🎵 *${audioInfo.title}* 🎵\n\n` +
                          `⏱️ *Duration*: ${Math.floor(audioInfo.duration / 60)}m ${audioInfo.duration % 60}s\n` +
                          `🎧 *Bitrate*: ${audioInfo.bitrate}kbps\n` +
                          `🔗 *URL*: ${audioInfo.url}\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
                return;
        }
        
        if (['rock', 'paper', 'scissors'].includes(command)) {
            const result = playRPS(command, jid, userJid);
            await sendMessageWithDelay(sock, jid, { text: result });
            return;
        }
        
        if (/^\d+$/.test(command)) {
            const guessResult = playNumberGuess(command, jid, userJid);
            if (guessResult !== '❌ No active number game. Start one with Games Arena!') {
                await sendMessageWithDelay(sock, jid, { text: guessResult });
                return;
            }
        }
        
        if (/^[1-9]$/.test(command)) {
            const choice = parseInt(command);
            await handleMenuNavigation(sock, jid, userJid, session.currentMenu, choice.toString());
            return;
        }
        
        if (command.length > 1 && session.currentMenu === 'creative') {
            const asciiArt = generateASCIIArt(command);
            await sendMessageWithDelay(sock, jid, { 
                text: `🎨 *${BOT_NAME} ASCII Art* 🎨\n\n\`\`\`\n${asciiArt}\n\`\`\`\n\n` +
                      `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
            });
            return;
        }
        
        if (session.aiMode) {
            const aiResponse = await getAIResponse(command + ' ' + args.join(' '));
            await sendMessageWithDelay(sock, jid, { 
                text: `🤖 *${BOT_NAME}'s AI Response* 🤖\n\n${aiResponse}\n\n` +
                      `💡 Keep chatting or type .back to exit AI mode!` 
            });
            return;
        }
        
        await sendMessageWithDelay(sock, jid, renderMenu(session.currentMenu, userJid));
        
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Command error:`, error);
        await sendMessageWithDelay(sock, jid, { 
            text: `⚠️ *Oops!* Something went wrong. 😅\n\nType .menu to restart!\n\n` +
                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
        });
    }
}

async function handleMenuNavigation(sock, jid, userJid, currentMenu, choice) {
    const isAdminUser = isAdmin(userJid);
    const isOwnerUser = isOwner(userJid);
    
    try {
        switch (currentMenu) {
            case 'main':
                const menus = ['creative', 'games', 'utility', 'analytics', 'fun', 'group', 'youtube', 'admin', 'help'];
                if (choice === 'creative' || choice === '1') {
                    if (hasFeatureAccess('creativeHub')) {
                        updateUserSession(userJid, 'creative');
                        await sendMessageWithDelay(sock, jid, renderMenu('creative', userJid));
                    }
                } else if (choice === 'games' || choice === '2') {
                    if (hasFeatureAccess('gamesArena')) {
                        updateUserSession(userJid, 'games');
                        await sendMessageWithDelay(sock, jid, renderMenu('games', userJid));
                    }
                } else if (choice === 'utility' || choice === '3') {
                    if (hasFeatureAccess('utilityCenter')) {
                        updateUserSession(userJid, 'utility');
                        await sendMessageWithDelay(sock, jid, renderMenu('utility', userJid));
                    }
                } else if (choice === 'analytics' || choice === '4') {
                    if (hasFeatureAccess('analyticsPanel')) {
                        await sendMessageWithDelay(sock, jid, { 
                            text: `📊 *${BOT_NAME} Analytics Dashboard* 📊\n\n` +
                                  `🚧 Coming soon! Stay tuned for insights!\n\n` +
                                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                        });
                    }
                } else if (choice === 'fun' || choice === '5') {
                    if (hasFeatureAccess('funZone')) {
                        await sendMessageWithDelay(sock, jid, { 
                            text: `🎭 *${BOT_NAME} Fun Zone* 🎭\n\n` +
                                  `Try these commands:\n` +
                                  `😂 .joke - Get a laugh\n` +
                                  `🤓 .fact - Learn something new\n` +
                                  `💬 .quote - Get inspired\n\n` +
                                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                        });
                    }
                } else if (choice === 'group' || choice === '6') {
                    if (hasFeatureAccess('groupCommands')) {
                        updateUserSession(userJid, 'group');
                        await sendMessageWithDelay(sock, jid, renderMenu('group', userJid));
                    }
                } else if (choice === 'youtube' || choice === '7') {
                    if (hasFeatureAccess('youtubeCommands')) {
                        updateUserSession(userJid, 'youtube');
                        await sendMessageWithDelay(sock, jid, renderMenu('youtube', userJid));
                    }
                } else if ((choice === 'admin' || choice === '8') && isAdminUser) {
                    updateUserSession(userJid, 'admin');
                    await sendMessageWithDelay(sock, jid, renderMenu('admin', userJid));
                } else if (choice === 'help' || choice === '9') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `❓ *${BOT_NAME} Help Center* ❓\n\n` +
                              `🔹 *.menu* → Main menu\n` +
                              `🔹 *.back* → Go back\n` +
                              `🔹 *.ping* → Check bot status\n` +
                              `🔹 *.joke* → Hear a joke\n` +
                              `🔹 *.fact* → Learn a fact\n` +
                              `🔹 *.quote* → Get a quote\n` +
                              `🔹 *.ai [query]* → Talk to AI\n` +
                              `🔹 *.ytsearch [query]* → Search YouTube\n` +
                              `🔹 *.ytvideo [url]* → Video info\n` +
                              `🔹 *.ytaudio [url]* → Audio info\n` +
                              `🔹 *.announce [msg]* → Group announcement\n` +
                              `🔹 *.tagall* → Tag all members\n` +
                              `⏰ *Note*: Menus reset after 5 minutes\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'creative':
                if (choice === 'ascii' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🎨 *${BOT_NAME} ASCII Art Generator* 🎨\n\n` +
                              `Type any word to convert to ASCII art!\n` +
                              `Example: Type "HELLO" for ASCII art\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'image' || choice === '2') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🖼️ *${BOT_NAME} Image to ASCII* 🖼️\n\n` +
                              `🚧 Coming soon! Send images to convert to ASCII art.\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'ai' || choice === '3') {
                    session.aiMode = true;
                    await saveData('userSessions');
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🤖 *${BOT_NAME} AI Chat Activated* 🤖\n\n` +
                              `I'm now in AI mode! Ask me anything, and I'll respond intelligently.\n` +
                              `Type .back to exit AI mode.\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'games':
                if (choice === 'rps' || choice === '1') {
                    const game = startRockPaperScissors(jid);
                    await sendMessageWithDelay(sock, jid, { text: game });
                } else if (choice === 'guess' || choice === '2') {
                    const game = startNumberGuess(jid);
                    await sendMessageWithDelay(sock, jid, { text: game });
                } else if (choice === 'trivia' || choice === '3') {
                    const trivia = startTrivia(jid);
                    await sendMessageWithDelay(sock, jid, { text: trivia });
                } else if (choice === 'riddle' || choice === '4') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🎯 *${BOT_NAME} Emoji Riddle* 🎯\n\n` +
                              `🚧 Coming soon! Guess movies/songs from emojis!\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'scramble' || choice === '5') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔤 *${BOT_NAME} Word Scramble* 🔤\n\n` +
                              `🚧 Coming soon! Unscramble letters to find words!\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'leaderboard' || choice === '6') {
                    const scores = activeGames[jid]?.scores || {};
                    const leaderboard = Object.entries(scores).map(([player, score]) => `${player.slice(0,8)}...: ${score}`).join('\n') || 'No scores yet!';
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🏆 *${BOT_NAME} Leaderboards* 🏆\n\n${leaderboard}\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'admin' || choice === '7') {
                    if (isAdminUser) {
                        await sendMessageWithDelay(sock, jid, { 
                            text: `⚙️ *${BOT_NAME} Game Admin* ⚙️\n\n` +
                                  `🚧 Coming soon! Manage games like a pro.\n\n` +
                                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                        });
                    }
                }
                break;
                
            case 'utility':
                if (choice === 'remind' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `📅 *${BOT_NAME} Reminders* 📅\n\n` +
                              `Use .remind [time] [message]\n` +
                              `Example: .remind 1h Meeting\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'note' || choice === '2') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `📝 *${BOT_NAME} Notes* 📝\n\n` +
                              `Use .note [content]\n` +
                              `Example: .note Buy groceries\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'calc' || choice === '3') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔢 *${BOT_NAME} Calculator* 🔢\n\n` +
                              `Use .calc [expression]\n` +
                              `Example: .calc 2+2\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'translate' || choice === '4') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🌐 *${BOT_NAME} Translator* 🌐\n\n` +
                              `Use .translate [lang] [text] (lang optional, default en)\n` +
                              `Example: .translate es Hello\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'group':
                if (choice === 'announce' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `📢 *${BOT_NAME} Announce* 📢\n\n` +
                              `Use .announce [message]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'tagall' || choice === '2') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🏷️ *${BOT_NAME} Tag All* 🏷️\n\n` +
                              `Use .tagall to tag all group members\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'lock' || choice === '3') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔒 *${BOT_NAME} Group Lock* 🔒\n\n` +
                              `Use .lockgroup to restrict group\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'unlock' || choice === '4') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔓 *${BOT_NAME} Group Unlock* 🔓\n\n` +
                              `Use .unlockgroup to open group\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'kick' || choice === '5') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `👋 *${BOT_NAME} Kick User* 👋\n\n` +
                              `Use .kick [phone_number]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'youtube':
                if (choice === 'search' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔍 *${BOT_NAME} YouTube Search* 🔍\n\n` +
                              `Use .ytsearch [query]\n` +
                              `Example: .ytsearch funny cats\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'video' || choice === '2') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🎥 *${BOT_NAME} Video Info* 🎥\n\n` +
                              `Use .ytvideo [video_url]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'audio' || choice === '3') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🎵 *${BOT_NAME} Audio Info* 🎵\n\n` +
                              `Use .ytaudio [video_url]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'admin':
                if (!isAdminUser) return;
                if (choice === 'users' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `👥 *${BOT_NAME} User Management* 👥\n\n` +
                              `📊 *Active Users*: ${Object.keys(botData.userSessions).length}\n` +
                              `👑 *Total Admins*: ${CONFIG.ADMIN_NUMBERS.length}\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'features' || choice === '2') {
                    const features = Object.entries(botData.features).map(([key, value]) => `${value ? '✅' : '❌'} ${key}`).join('\n');
                    await sendMessageWithDelay(sock, jid, { 
                        text: `⚙️ *${BOT_NAME} Feature Status* ⚙️\n\n${features}\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'games' || choice === '3') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🎮 *${BOT_NAME} Game Management* 🎮\n\n` +
                              `🏆 Leaderboards\n` +
                              `🎯 Active games\n` +
                              `⚙️ Coming soon!\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if ((choice === 'stock' || choice === '4') && isOwnerUser) {
                    botData.features.stockCount = !botData.features.stockCount;
                    await saveData('features');
                    await sendMessageWithDelay(sock, jid, { 
                        text: `📊 *${BOT_NAME} Stock Count Toggle* 📊\n\n` +
                              `Status: ${botData.features.stockCount ? '✅ ENABLED' : '❌ DISABLED'}\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if ((choice === 'owner' || choice === '5') && isOwnerUser) {
                    updateUserSession(userJid, 'owner');
                    await sendMessageWithDelay(sock, jid, renderMenu('owner', userJid));
                } else if (choice === 'kill' || choice === '6') {
                    botData.features.masterSwitch = !botData.features.masterSwitch;
                    await saveData('features');
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔴 *${BOT_NAME} Master Switch* 🔴\n\n` +
                              `Status: ${botData.features.masterSwitch ? '✅ ONLINE' : '❌ OFFLINE'}\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            case 'owner':
                if (!isOwnerUser) return;
                if (choice === 'broadcast' || choice === '1') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `📢 *${BOT_NAME} Broadcast* 📢\n\n` +
                              `Use .broadcast [message]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'restart' || choice === '2') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🔄 *${BOT_NAME} Restart* 🔄\n\n` +
                              `Use .restart to restart bot\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'addadmin' || choice === '3') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🛡️ *${BOT_NAME} Add Admin* 🛡️\n\n` +
                              `Use .addadmin [phone_number]\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                } else if (choice === 'cleardata' || choice === '4') {
                    await sendMessageWithDelay(sock, jid, { 
                        text: `🗑️ *${BOT_NAME} Clear Data* 🗑️\n\n` +
                              `Use .cleardata to reset bot data\n\n` +
                              `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                    });
                }
                break;
                
            default:
                await sendMessageWithDelay(sock, jid, { 
                    text: `🚧 *${BOT_NAME} Feature Under Development!* 🚧\n\n` +
                          `Stay tuned for more awesomeness!\n\n` +
                          `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                });
        }
    } catch (error) {
        console.error(`❌ ${BOT_NAME} Navigation error:`, error);
        await sendMessageWithDelay(sock, jid, { 
            text: `⚠️ *Navigation Failed!* 😅\n\nType .menu to restart!\n\n` +
                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
        });
    }
}

async function startBot() {
    await initializeDataSystem();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: [`${BOT_NAME} (${BOT_ALIAS})`, 'Chrome', '1.0.0'],
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log(`📱 ${BOT_NAME} Scan QR code:`);
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log(`✅ ${BOT_NAME} Connected!`);
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            if (!msg || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast' || !msg.message) return;

            const messageType = Object.keys(msg.message)[0];
            if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                const userJid = msg.key.participant || msg.key.remoteJid;
                
                if (isStockCountMessage(text)) await handleStockCountReaction(sock, msg);
                
                const session = getUserSession(userJid);
                
                if (text && text.startsWith('.')) {
                    const parts = text.slice(1).split(' ');
                    const command = parts[0].toLowerCase();
                    const args = parts.slice(1);
                    await processCommand(sock, msg, command, args);
                } else if (session.aiMode) {
                    const aiResponse = await getAIResponse(text);
                    await sendMessageWithDelay(sock, msg.key.remoteJid, { 
                        text: `🤖 *${BOT_NAME}'s AI Response* 🤖\n\n${aiResponse}\n\n` +
                              `💡 Keep chatting or type .back to exit AI mode!` 
                    });
                } else {
                    const triviaResult = playTrivia(text, msg.key.remoteJid, userJid);
                    if (triviaResult !== '❌ No active trivia. Start one in Games Arena!') {
                        await sendMessageWithDelay(sock, msg.key.remoteJid, { text: triviaResult });
                    }
                }
            } else if (messageType === 'buttonsResponseMessage') {
                const buttonId = msg.message.buttonsResponseMessage.selectedButtonId;
                await handleButtonInteraction(sock, msg, buttonId);
            }
        } catch (error) {
            console.error(`❌ ${BOT_NAME} Message error:`, error);
        }
    });

    sock.ev.on('messages.reaction', async (reactions) => {
        try {
            for (const reaction of reactions) {
                const msgKey = `${reaction.key.remoteJid}_${reaction.key.id}`;
                if (botData.reactionCounters[msgKey]) {
                    if (reaction.reaction.text) botData.reactionCounters[msgKey].count += 1;
                    else botData.reactionCounters[msgKey].count = Math.max(0, botData.reactionCounters[msgKey].count - 1);
                    
                    await saveData('reactionCounters');
                    
                    if (botData.reactionCounters[msgKey].count === 10 && !botData.reactionCounters[msgKey].hasReplied) {
                        await sendMessageWithDelay(sock, reaction.key.remoteJid, { 
                            text: `📊 *Stock Counter Milestone!* 📊\n\nReached 10 reactions!\n\n` +
                                  `— Powered by ${BOT_NAME} (${BOT_ALIAS})` 
                        }, 2000, 4000);
                        botData.reactionCounters[msgKey].hasReplied = true;
                        await saveData('reactionCounters');
                    }
                }
            }
        } catch (error) {
            console.error(`❌ ${BOT_NAME} Reaction error:`, error);
        }
    });

    return sock;
}

console.log(`🚀 Starting ${BOT_NAME} (${BOT_ALIAS})...`);
console.log('🎮 All features loaded and ready!');
startBot().catch(err => {
    console.error('❌ Bot startup error:', err);
    process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n💾 Saving data before shutdown...');
    await backupData();
    console.log('👋 Bot shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    await backupData();
    process.exit(0);
});