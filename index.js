const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs').promises;
const path = require('path');
const ytdl = require('ytdl-core'); // Added for YouTube functionality
const { exec } = require('child_process');
const fetch = require('node-fetch');

const logger = P({ level: 'silent' });

const CONFIG = {
    MENU_TIMEOUT: 5 * 60 * 1000,
    BACKUP_INTERVAL: 30 * 60 * 1000,
    DATA_DIR: path.join(__dirname, 'data'),
    OWNER_NUMBER: '2348088866878',
    OWNER_ALT_ID: '211532071870561',
    ADMIN_NUMBERS: ['2348088866878', '2349057938488']
};

const startTime = Date.now();

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
        console.log('📊 Data system initialized');
    } catch (error) {
        console.error('❌ Data system init failed:', error);
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
        console.log('💾 Backup completed');
    } catch (error) {
        console.error('❌ Backup failed:', error);
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
    // Placeholder: Implement group metadata check with Baileys
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

function renderMenu(menuName, userJid) {
    const isAdminUser = isAdmin(userJid);
    const isOwnerUser = isOwner(userJid);
    
    const menus = {
        main: `🎮 ═══════════════════ 🤖\n║     MAIN MENU        ║\n║  🎨 [1] Creative Hub ║\n║  🎮 [2] Games Arena  ║\n║  🛠️  [3] Utility Center║\n║  📊 [4] Analytics    ║\n║  🎭 [5] Fun Zone     ║\n║  👥 [6] Group Tools  ║\n║  📺 [7] YouTube Tools║\n${isAdminUser ? '║  👑 [8] Admin Panel  ║' : ''}\n║  ❓ [9] Help Center  ║\n║  .help ? .admin 👑   ║\n╚══════════════════════╝`,
        
        creative: `🎨 ═══════════════════ 🤖\n║   CREATIVE HUB       ║\n║  ✨ [1] ASCII Art    ║\n║  🖼️  [2] Image→ASCII ║\n║  🤖 [3] AI Chat      ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        games: `🎮 ═══════════════════ 🤖\n║    GAMES ARENA       ║\n║  ✂️  [1] Rock Paper   ║\n║  🔢 [2] Number Guess ║\n║  🧠 [3] Trivia Bot   ║\n║  🎯 [4] Emoji Riddle ║\n║  🔤 [5] Word Scramble║\n║  🏆 [6] Leaderboards ║\n${isAdminUser ? '║  ⚙️  [7] Game Admin   ║' : ''}\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        utility: `🛠️ ═══════════════════ 🤖\n║   UTILITY CENTER     ║\n║  📅 [1] Reminders    ║\n║  📝 [2] Notes        ║\n║  🔢 [3] Calculator   ║\n║  🌐 [4] Translator   ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        group: `👥 ═══════════════════ 🤖\n║    GROUP TOOLS       ║\n║  📢 [1] Announce     ║\n║  🏷️  [2] Tag All     ║\n║  🔒 [3] Group Lock   ║\n║  🔓 [4] Group Unlock ║\n║  👋 [5] Kick User    ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        youtube: `📺 ═══════════════════ 🤖\n║   YOUTUBE TOOLS      ║\n║  🔍 [1] Search Video ║\n║  🎥 [2] Video Info   ║\n║  🎵 [3] Audio Info   ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        admin: `👑 ═══════════════════ 🤖\n║    ADMIN PANEL       ║\n║  👥 [1] User Mgmt    ║\n║  ⚙️  [2] Features     ║\n║  🎮 [3] Game Mgmt    ║\n${isOwnerUser ? '║  📊 [4] Stock Toggle ║' : ''}\n${isOwnerUser ? '║  🔧 [5] Owner Tools  ║' : ''}\n║  🔴 [6] Kill Switch  ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`,

        owner: `🔧 ═══════════════════ 🤖\n║    OWNER TOOLS       ║\n║  📢 [1] Broadcast    ║\n║  🔄 [2] Restart Bot  ║\n║  🛡️ [3] Add Admin   ║\n║  🗑️  [4] Clear Data  ║\n║  .back ← .menu 🏠    ║\n╚══════════════════════╝`
    };
    
    return menus[menuName] || menus.main;
}

function getRandomDelay(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

async function sendMessageWithDelay(sock, jid, content, minDelay = 1000, maxDelay = 3000) {
    const delay = getRandomDelay(minDelay, maxDelay);
    setTimeout(async () => {
        try { await sock.sendMessage(jid, content); } 
        catch (error) { console.error('❌ Send error:', error); }
    }, delay);
}

function isStockCountMessage(text) { return text && text.toLowerCase().includes('new stock count'); }
function getMessageKey(msg) { return `${msg.key.remoteJid}_${msg.key.id}`; }

async function handleStockCountReaction(sock, msg) {
    if (!hasFeatureAccess('stockCount')) return;
    try {
        await sock.sendMessage(msg.key.remoteJid, { react: { text: '👍', key: msg.key } });
        const msgKey = getMessageKey(msg);
        if (!botData.reactionCounters[msgKey]) {
            botData.reactionCounters[msgKey] = { count: 0, hasReplied: false, messageText: 'Stock count message' };
            await saveData('reactionCounters');
        }
    } catch (error) { console.error('❌ Stock reaction error:', error); }
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
        console.error('❌ Translation error:', error);
        return '❌ Translation service unavailable';
    }
}

// YouTube Functions
async function searchYouTube(query) {
    return new Promise((resolve, reject) => {
        exec(`yt-dlp "ytsearch5:${query}" --dump-json`, (err, stdout) => {
            if (err) return reject(err);
            const results = stdout.split('\n').filter(line => line).map(JSON.parse);
            resolve(results.map(r => ({ title: r.title, url: r.webpage_url })));
        });
    });
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
        console.error('❌ YouTube video info error:', error);
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
        console.error('❌ YouTube audio info error:', error);
        return null;
    }
}

// Additional Commands Functions
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
        console.error('❌ Joke API error:', error);
        return '❌ Could not fetch a joke';
    }
}

async function getRandomFact() {
    try {
        const response = await fetch('https://uselessfacts.jsph.pl/random.json?language=en');
        const data = await response.json();
        return data.text;
    } catch (error) {
        console.error('❌ Fact API error:', error);
        return '❌ Could not fetch a fact';
    }
}

async function getRandomQuote() {
    try {
        const response = await fetch('https://api.quotable.io/random');
        const data = await response.json();
        return `*${data.content}*\n— _${data.author}_`;
    } catch (error) {
        console.error('❌ Quote API error:', error);
        return '❌ Could not fetch a quote';
    }
}

async function getAIResponse(query) {
    try {
        const response = await fetch(`https://ab-blackboxai.abrahamdw882.workers.dev/?q=${encodeURIComponent(query)}`);
        return await response.text();
    } catch (error) {
        console.error('❌ AI API error:', error);
        return '❌ AI service unavailable';
    }
}

// Games
let activeGames = {};

function startRockPaperScissors(chatId) {
    activeGames[chatId] = { type: 'rps', players: {}, scores: {} };
    return '✂️ ROCK PAPER SCISSORS!\n\nReply with: rock, paper, or scissors\n🎮 Game started!';
}

function playRPS(choice, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'rps') return '❌ No active RPS game';
    
    const botChoice = ['rock', 'paper', 'scissors'][Math.floor(Math.random() * 3)];
    const playerChoice = choice.toLowerCase();
    
    let result = '';
    if (playerChoice === botChoice) result = '🤝 TIE!';
    else if ((playerChoice === 'rock' && botChoice === 'scissors') || 
             (playerChoice === 'paper' && botChoice === 'rock') || 
             (playerChoice === 'scissors' && botChoice === 'paper')) {
        result = '🏆 YOU WIN!';
        game.scores[playerId] = (game.scores[playerId] || 0) + 1;
    } else result = '💀 YOU LOSE!';
    
    return `You: ${playerChoice} | Bot: ${botChoice}\n${result}\n\nScore: ${game.scores[playerId] || 0}`;
}

function startNumberGuess(chatId) {
    const number = Math.floor(Math.random() * 100) + 1;
    activeGames[chatId] = { type: 'guess', number, attempts: 7, players: {} };
    return '🔢 NUMBER GUESSING GAME!\n\nI\'m thinking of a number 1-100\nYou have 7 attempts!\n\nGuess a number!';
}

function playNumberGuess(guess, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'guess') return '❌ No active number game';
    
    const num = parseInt(guess);
    if (isNaN(num) || num < 1 || num > 100) return '❌ Enter a number between 1-100';
    
    game.attempts--;
    
    if (num === game.number) {
        delete activeGames[chatId];
        return `🎉 CORRECT! The number was ${game.number}!\n🏆 You won with ${7 - game.attempts} attempts!`;
    } else if (game.attempts <= 0) {
        delete activeGames[chatId];
        return `💀 Game Over! The number was ${game.number}`;
    } else {
        const hint = num > game.number ? '📉 Too high!' : '📈 Too low!';
        return `${hint}\n🎯 Attempts left: ${game.attempts}`;
    }
}

// Trivia Questions
const triviaQuestions = [
    { q: 'What is the capital of France?', a: 'paris', options: 'A) London B) Berlin C) Paris D) Madrid' },
    { q: 'How many continents are there?', a: '7', options: 'A) 5 B) 6 C) 7 D) 8' },
    { q: 'What is 2+2?', a: '4', options: 'A) 3 B) 4 C) 5 D) 6' },
    { q: 'Largest planet in our solar system?', a: 'jupiter', options: 'A) Earth B) Mars C) Jupiter D) Saturn' }
];

function startTrivia(chatId) {
    const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    activeGames[chatId] = { type: 'trivia', question, scores: {} };
    return `🧠 TRIVIA TIME!\n\n❓ ${question.q}\n\n${question.options}\n\nType your answer!`;
}

function playTrivia(answer, chatId, playerId) {
    const game = activeGames[chatId];
    if (!game || game.type !== 'trivia') return '❌ No active trivia';
    
    if (answer.toLowerCase().includes(game.question.a.toLowerCase())) {
        game.scores[playerId] = (game.scores[playerId] || 0) + 1;
        return `🏆 CORRECT! Answer: ${game.question.a}\n📊 Your score: ${game.scores[playerId]}`;
    } else {
        return `❌ Wrong! Correct answer: ${game.question.a}`;
    }
}

async function processCommand(sock, msg, command, args) {
    const jid = msg.key.remoteJid;
    const userJid = msg.key.participant || jid;
    
    try {
        if (checkSessionTimeout(userJid)) {
            await sendMessageWithDelay(sock, jid, { text: '⏰ Session timeout. Back to main menu.' }, 500, 1000);
        }
        
        const session = getUserSession(userJid);
        
        switch (command) {
            case 'menu': case 'home':
                updateUserSession(userJid, 'main');
                await sendMessageWithDelay(sock, jid, { text: renderMenu('main', userJid) });
                return;
            case 'back':
                updateUserSession(userJid, '', 'back');
                await sendMessageWithDelay(sock, jid, { text: renderMenu(getUserSession(userJid).currentMenu, userJid) });
                return;
            case 'admin':
                if (!isAdmin(userJid)) return;
                updateUserSession(userJid, 'admin');
                await sendMessageWithDelay(sock, jid, { text: renderMenu('admin', userJid) });
                return;
            case 'debug':
                if (!isAdmin(userJid)) return;
                await sendMessageWithDelay(sock, jid, { text: `🔍 DEBUG:\n📞 Number: ${extractPhoneNumber(userJid)}\n👑 Owner: ${isOwner(userJid)}\n🛡️ Admin: ${isAdmin(userJid)}\n🆔 JID: ${userJid}` });
                return;
            // Group Commands
            case 'announce':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                if (!args.length) return await sendMessageWithDelay(sock, jid, { text: '📢 Please provide announcement message' });
                await sendMessageWithDelay(sock, jid, { text: `📢 ANNOUNCEMENT: ${args.join(' ')}` });
                return;
            case 'tagall':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.tags[jid] = botData.groupData.tags[jid] || [];
                await sendMessageWithDelay(sock, jid, { text: `🏷️ Tagging all: ${botData.groupData.tags[jid].join(', ') || 'No members tagged'}` });
                return;
            case 'lockgroup':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.settings[jid] = { ...botData.groupData.settings[jid], locked: true };
                await saveData('groupData');
                await sendMessageWithDelay(sock, jid, { text: '🔒 Group locked' });
                return;
            case 'unlockgroup':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                botData.groupData.settings[jid] = { ...botData.groupData.settings[jid], locked: false };
                await saveData('groupData');
                await sendMessageWithDelay(sock, jid, { text: '🔓 Group unlocked' });
                return;
            case 'kick':
                if (!isGroupAdmin(sock, jid, userJid)) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '👋 Please provide user to kick' });
                await sendMessageWithDelay(sock, jid, { text: `👋 Kicked user ${args[0]}` });
                return;
            // Owner Commands
            case 'broadcast':
                if (!isOwner(userJid)) return;
                if (!args.length) return await sendMessageWithDelay(sock, jid, { text: '📢 Please provide broadcast message' });
                await sendMessageWithDelay(sock, jid, { text: `📢 Broadcast sent: ${args.join(' ')}` });
                return;
            case 'restart':
                if (!isOwner(userJid)) return;
                await sendMessageWithDelay(sock, jid, { text: '🔄 Restarting bot...' });
                process.exit(0);
                return;
            case 'addadmin':
                if (!isOwner(userJid)) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🛡️ Please provide phone number to add as admin' });
                CONFIG.ADMIN_NUMBERS.push(args[0]);
                await sendMessageWithDelay(sock, jid, { text: `🛡️ Added ${args[0]} as admin` });
                return;
            case 'cleardata':
                if (!isOwner(userJid)) return;
                botData = { ...botData, reactionCounters: {}, userSessions: {}, gameData: { leaderboards: { global: {}, groups: {} }, activeGames: {} } };
                await saveData('reactionCounters');
                await saveData('userSessions');
                await saveData('gameData');
                await sendMessageWithDelay(sock, jid, { text: '🗑️ Bot data cleared' });
                return;
            // Utility Commands
            case 'remind':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '📅 Please provide reminder time and message' });
                await sendMessageWithDelay(sock, jid, { text: `📅 Reminder set: ${args.join(' ')}` });
                return;
            case 'note':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '📝 Please provide note content' });
                botData.userSessions[userJid].notes = botData.userSessions[userJid].notes || [];
                botData.userSessions[userJid].notes.push(args.join(' '));
                await saveData('userSessions');
                await sendMessageWithDelay(sock, jid, { text: `📝 Note saved: ${args.join(' ')}` });
                return;
            case 'calc':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🔢 Please provide calculation' });
                const result = calculate(args.join(' '));
                await sendMessageWithDelay(sock, jid, { text: `🔢 Result: ${result}` });
                return;
            case 'translate':
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🌐 Please provide text to translate' });
                let targetLang = 'en';
                let translateArgs = args;
                if (args.length > 1 && args[0].length === 2) {
                    targetLang = args[0];
                    translateArgs = args.slice(1);
                }
                const translation = await translateText(translateArgs.join(' '), targetLang);
                await sendMessageWithDelay(sock, jid, { text: `🌐 Translation: *${translation}*` });
                return;
            // Fun Commands
            case 'joke':
                const joke = await getRandomJoke();
                await sendMessageWithDelay(sock, jid, { text: `😂 *Joke Time!*\n\n${joke}\n\nWant more? Type .joke again! 🎉` });
                return;
            case 'fact':
                const fact = await getRandomFact();
                await sendMessageWithDelay(sock, jid, { text: `🤓 *Fun Fact!*\n\n${fact}\n\nAmazing, right? Try .fact for another! 🌟` });
                return;
            case 'quote':
                const quote = await getRandomQuote();
                await sendMessageWithDelay(sock, jid, { text: `💬 *Inspirational Quote*\n\n${quote}\n\nFeeling motivated? Get another with .quote! ✨` });
                return;
            // YouTube Commands
            case 'ytsearch':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🔍 Please provide YouTube search query' });
                const searchResults = await searchYouTube(args.join(' '));
                if (!searchResults.length) return await sendMessageWithDelay(sock, jid, { text: '❌ No results found' });
                const formattedResults = searchResults.map((r, i) => `${i+1}. *${r.title}*\n${r.url}`).join('\n\n');
                await sendMessageWithDelay(sock, jid, { text: `🔍 *YouTube Search Results:*\n\n${formattedResults}` });
                return;
            case 'ytvideo':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🎥 Please provide YouTube video URL' });
                if (!ytdl.validateURL(args[0])) return await sendMessageWithDelay(sock, jid, { text: '❌ Invalid YouTube URL' });
                const videoInfo = await getVideoInfo(args[0]);
                if (!videoInfo) return await sendMessageWithDelay(sock, jid, { text: '❌ Video not found' });
                await sendMessageWithDelay(sock, jid, { text: `🎥 *${videoInfo.title}*\n👀 Views: ${videoInfo.views}\n⏱️ Duration: ${Math.floor(videoInfo.duration / 60)}m ${videoInfo.duration % 60}s\n🔗 ${videoInfo.url}` });
                return;
            case 'ytaudio':
                if (!hasFeatureAccess('youtubeCommands')) return;
                if (!args[0]) return await sendMessageWithDelay(sock, jid, { text: '🎵 Please provide YouTube video URL' });
                if (!ytdl.validateURL(args[0])) return await sendMessageWithDelay(sock, jid, { text: '❌ Invalid YouTube URL' });
                const audioInfo = await getAudioInfo(args[0]);
                if (!audioInfo) return await sendMessageWithDelay(sock, jid, { text: '❌ Audio not found' });
                await sendMessageWithDelay(sock, jid, { text: `🎵 *${audioInfo.title}*\n⏱️ Duration: ${Math.floor(audioInfo.duration / 60)}m ${audioInfo.duration % 60}s\n🎧 Bitrate: ${audioInfo.bitrate}kbps\n🔗 ${audioInfo.url}` });
                return;
            case 'ping':
                const latency = Date.now() - msg.messageTimestamp * 1000;
                const uptimeMinutes = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
                await sendMessageWithDelay(sock, jid, { text: `🏓 *Pong!*\n\n⚡ *Latency:* ${latency}ms\n🕒 *Uptime:* ${uptimeMinutes} minutes\n🚀 *Status:* Online and ready!\n\nType .menu for commands! 🌟` });
                return;
        }
        
        // Handle game commands
        if (['rock', 'paper', 'scissors'].includes(command)) {
            const result = playRPS(command, jid, userJid);
            await sendMessageWithDelay(sock, jid, { text: result });
            return;
        }
        
        if (/^\d+$/.test(command)) {
            const guessResult = playNumberGuess(command, jid, userJid);
            if (guessResult !== '❌ No active number game') {
                await sendMessageWithDelay(sock, jid, { text: guessResult });
                return;
            }
        }
        
        // Menu navigation
        if (/^[1-9]$/.test(command)) {
            const choice = parseInt(command);
            await handleMenuNavigation(sock, jid, userJid, session.currentMenu, choice);
            return;
        }
        
        // ASCII Art Generation
        if (command.length > 1 && session.currentMenu === 'creative') {
            const asciiArt = generateASCIIArt(command);
            await sendMessageWithDelay(sock, jid, { text: `🎨 ASCII ART:\n\n\`\`\`\n${asciiArt}\n\`\`\`` });
            return;
        }
        
        await sendMessageWithDelay(sock, jid, { text: renderMenu(session.currentMenu, userJid) });
        
    } catch (error) {
        console.error('❌ Command error:', error);
        await sendMessageWithDelay(sock, jid, { text: '⚠️ Error occurred. Type .menu to restart.' });
    }
}

async function handleMenuNavigation(sock, jid, userJid, currentMenu, choice) {
    const isAdminUser = isAdmin(userJid);
    const isOwnerUser = isOwner(userJid);
    
    try {
        switch (currentMenu) {
            case 'main':
                const menus = ['creative', 'games', 'utility', 'analytics', 'fun', 'group', 'youtube'];
                if (choice <= 7 && hasFeatureAccess(menus[choice - 1] || 'main')) {
                    updateUserSession(userJid, menus[choice - 1]);
                    await sendMessageWithDelay(sock, jid, { text: renderMenu(menus[choice - 1], userJid) });
                } else if (choice === 8 && isAdminUser) {
                    updateUserSession(userJid, 'admin');
                    await sendMessageWithDelay(sock, jid, { text: renderMenu('admin', userJid) });
                } else if (choice === 9) {
                    await sendMessageWithDelay(sock, jid, { text: '❓ HELP:\n\n🔹 .menu → Main menu\n🔹 .back → Go back\n🔹 .admin → Admin panel\n🔹 .ytvideo → Video info\n🔹 .ytaudio → Audio info\n🔹 .announce → Group announcement\n🔹 .tagall → Tag all members\n🔹 .joke → Get a joke\n🔹 .fact → Get a fact\n🔹 .quote → Get a quote\n⏰ Menus reset after 5min' });
                }
                break;
                
            case 'creative':
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: '🎨 ASCII ART GENERATOR\n\nType any word to convert to ASCII art!\nExample: Type "HELLO" for ASCII art' });
                else if (choice === 2) await sendMessageWithDelay(sock, jid, { text: '🖼️ IMAGE → ASCII\n\n🚧 Coming soon! Send images to convert to ASCII art.' });
                else if (choice === 3) {
                    const session = getUserSession(userJid);
                    session.aiMode = true;
                    saveData('userSessions');
                    await sendMessageWithDelay(sock, jid, { text: '🤖 AI CHAT ACTIVATED\n\nI\'m now in AI mode! Ask me anything and I\'ll respond intelligently!\nType .back to exit AI mode.' });
                }
                break;
                
            case 'games':
                if (choice === 1) {
                    const game = startRockPaperScissors(jid);
                    await sendMessageWithDelay(sock, jid, { text: game });
                } else if (choice === 2) {
                    const game = startNumberGuess(jid);
                    await sendMessageWithDelay(sock, jid, { text: game });
                } else if (choice === 3) {
                    const trivia = startTrivia(jid);
                    await sendMessageWithDelay(sock, jid, { text: trivia });
                } else if (choice === 4) {
                    await sendMessageWithDelay(sock, jid, { text: '🎯 EMOJI RIDDLE\n\n🚧 Coming soon! Guess movies/songs from emojis!' });
                } else if (choice === 5) {
                    await sendMessageWithDelay(sock, jid, { text: '🔤 WORD SCRAMBLE\n\n🚧 Coming soon! Unscramble letters to find words!' });
                } else if (choice === 6) {
                    const scores = activeGames[jid]?.scores || {};
                    const leaderboard = Object.entries(scores).map(([player, score]) => `${player.slice(0,8)}...: ${score}`).join('\n') || 'No scores yet!';
                    await sendMessageWithDelay(sock, jid, { text: `🏆 LEADERBOARDS\n\n${leaderboard}` });
                }
                break;
                
            case 'utility':
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: '📅 REMINDERS\n\nUse .remind [time] [message]\nExample: .remind 1h Meeting' });
                else if (choice === 2) await sendMessageWithDelay(sock, jid, { text: '📝 NOTES\n\nUse .note [content]\nExample: .note Buy groceries' });
                else if (choice === 3) await sendMessageWithDelay(sock, jid, { text: '🔢 CALCULATOR\n\nUse .calc [expression]\nExample: .calc 2+2' });
                else if (choice === 4) await sendMessageWithDelay(sock, jid, { text: '🌐 TRANSLATOR\n\nUse .translate [lang] [text] (lang optional, default en)\nExample: .translate es Hello' });
                break;
                
            case 'group':
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: '📢 ANNOUNCEMENT\n\nUse .announce [message]' });
                else if (choice === 2) await sendMessageWithDelay(sock, jid, { text: '🏷️ TAG ALL\n\nUse .tagall to tag all group members' });
                else if (choice === 3) await sendMessageWithDelay(sock, jid, { text: '🔒 GROUP LOCK\n\nUse .lockgroup to restrict group' });
                else if (choice === 4) await sendMessageWithDelay(sock, jid, { text: '🔓 GROUP UNLOCK\n\nUse .unlockgroup to open group' });
                else if (choice === 5) await sendMessageWithDelay(sock, jid, { text: '👋 KICK USER\n\nUse .kick [phone_number]' });
                break;
                
            case 'youtube':
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: '🔍 YOUTUBE SEARCH\n\nUse .ytsearch [query]' });
                else if (choice === 2) await sendMessageWithDelay(sock, jid, { text: '🎥 VIDEO INFO\n\nUse .ytvideo [video_url]' });
                else if (choice === 3) await sendMessageWithDelay(sock, jid, { text: '🎵 AUDIO INFO\n\nUse .ytaudio [video_url]' });
                break;
                
            case 'admin':
                if (!isAdminUser) return;
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: `👥 USER MANAGEMENT\n\n📊 Active users: ${Object.keys(botData.userSessions).length}\n👑 Total admins: ${CONFIG.ADMIN_NUMBERS.length}` });
                else if (choice === 2) {
                    const features = Object.entries(botData.features).map(([key, value]) => `${value ? '✅' : '❌'} ${key}`).join('\n');
                    await sendMessageWithDelay(sock, jid, { text: `⚙️ FEATURE STATUS\n\n${features}` });
                } else if (choice === 3) await sendMessageWithDelay(sock, jid, { text: '🎮 GAME MANAGEMENT\n\n🏆 Leaderboards\n🎯 Active games\n⚙️ Coming soon!' });
                else if (choice === 4 && isOwnerUser) {
                    botData.features.stockCount = !botData.features.stockCount;
                    await saveData('features');
                    await sendMessageWithDelay(sock, jid, { text: `📊 STOCK COUNT: ${botData.features.stockCount ? '✅ ENABLED' : '❌ DISABLED'}` });
                } else if (choice === 5 && isOwnerUser) {
                    updateUserSession(userJid, 'owner');
                    await sendMessageWithDelay(sock, jid, { text: renderMenu('owner', userJid) });
                } else if (choice === 6) {
                    botData.features.masterSwitch = !botData.features.masterSwitch;
                    await saveData('features');
                    await sendMessageWithDelay(sock, jid, { text: `🔴 MASTER SWITCH: ${botData.features.masterSwitch ? '✅ ONLINE' : '❌ OFFLINE'}` });
                }
                break;
                
            case 'owner':
                if (!isOwnerUser) return;
                if (choice === 1) await sendMessageWithDelay(sock, jid, { text: '📢 BROADCAST\n\nUse .broadcast [message]' });
                else if (choice === 2) await sendMessageWithDelay(sock, jid, { text: '🔄 RESTART\n\nUse .restart to restart bot' });
                else if (choice === 3) await sendMessageWithDelay(sock, jid, { text: '🛡️ ADD ADMIN\n\nUse .addadmin [phone_number]' });
                else if (choice === 4) await sendMessageWithDelay(sock, jid, { text: '🗑️ CLEAR DATA\n\nUse .cleardata to reset bot data' });
                break;
                
            default:
                await sendMessageWithDelay(sock, jid, { text: '🚧 Feature under development!' });
        }
    } catch (error) {
        console.error('❌ Navigation error:', error);
        await sendMessageWithDelay(sock, jid, { text: '⚠️ Navigation failed. Type .menu' });
    }
}

async function startBot() {
    await initializeDataSystem();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state, logger, printQRInTerminal: false,
        browser: ["WhatsApp Advanced Bot", "Chrome", "1.0.0"],
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        if (qr) {
            console.log('📱 Scan QR code:');
            qrcode.generate(qr, { small: true });
        }
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) setTimeout(startBot, 3000);
        } else if (connection === 'open') {
            console.log('✅ Advanced Bot Connected!');
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
                    // Handle AI response
                    const aiResponse = await getAIResponse(text);
                    await sendMessageWithDelay(sock, msg.key.remoteJid, { text: `🤖 *AI Response:*\n\n${aiResponse}` });
                } else {
                    // Handle trivia answers
                    const triviaResult = playTrivia(text, msg.key.remoteJid, userJid);
                    if (triviaResult !== '❌ No active trivia') {
                        await sendMessageWithDelay(sock, msg.key.remoteJid, { text: triviaResult });
                    }
                }
            }
        } catch (error) {
            console.error('❌ Message error:', error);
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
                        await sendMessageWithDelay(sock, reaction.key.remoteJid, { text: 'Number of stock counters reached: 10' }, 2000, 4000);
                        botData.reactionCounters[msgKey].hasReplied = true;
                        await saveData('reactionCounters');
                    }
                }
            }
        } catch (error) {
            console.error('❌ Reaction error:', error);
        }
    });

    return sock;
}

console.log('🚀 Starting Complete Advanced WhatsApp Bot...');
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