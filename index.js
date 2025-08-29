case 'hi':
                await sendMessageWithDelay(sock, jid, { 
                    text: '👋 Hello! I\'m an advanced WhatsApp bot.\n\nType .menu to explore my features!' 
                }, 1000, 2000);
                return;const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');
const fs = require('fs').promises;
const path = require('path');

// Create logger
const logger = P({ level: 'silent' });

// Configuration
const CONFIG = {
    MENU_TIMEOUT: 5 * 60 * 1000, // 5 minutes
    BACKUP_INTERVAL: 30 * 60 * 1000, // 30 minutes
    DATA_DIR: path.join(__dirname, 'data'),
    OWNER_NUMBER: '2348088866878', // Just the number without @s.whatsapp.net
    ADMIN_NUMBERS: ['2348088866878', '2349057938488'], // Just numbers
    CONTROL_GROUP: 'bot control room' // Case insensitive group name matching
};

// Data storage objects
let botData = {
    admins: [...CONFIG.ADMIN_NUMBERS.map(num => num + '@s.whatsapp.net')],
    features: {
        stockCount: true,
        creativeHub: true,
        gamesArena: true,
        utilityCenter: true,
        analyticsPanel: true,
        funZone: true,
        masterSwitch: true
    },
    reactionCounters: {},
    userSessions: {},
    gameData: {
        leaderboards: { global: {}, groups: {} },
        activeGames: {}
    },
    analytics: {
        commandUsage: {},
        userActivity: {},
        groupStats: {}
    }
};

// Initialize data directory and files
async function initializeDataSystem() {
    try {
        // Create data directory
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
        
        // Load existing data or create defaults
        await loadAllData();
        
        // Set up auto-backup
        setInterval(backupData, CONFIG.BACKUP_INTERVAL);
        
        console.log('📊 Data system initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize data system:', error);
    }
}

// Load all data from files
async function loadAllData() {
    const files = ['admins.json', 'features.json', 'reactionCounters.json', 
                   'userSessions.json', 'gameData.json', 'analytics.json'];
    
    for (const file of files) {
        try {
            const filePath = path.join(CONFIG.DATA_DIR, file);
            const data = await fs.readFile(filePath, 'utf8');
            const key = file.replace('.json', '');
            const parsedData = JSON.parse(data);
            
            if (key === 'admins') botData.admins = parsedData;
            else if (key === 'features') botData.features = { ...botData.features, ...parsedData };
            else botData[key] = parsedData;
            
            console.log(`✅ Loaded ${file}`);
        } catch (error) {
            console.log(`📁 ${file} not found, using defaults`);
        }
    }
}

// Save data to files
async function saveData(type) {
    try {
        const filePath = path.join(CONFIG.DATA_DIR, `${type}.json`);
        await fs.writeFile(filePath, JSON.stringify(botData[type], null, 2));
    } catch (error) {
        console.error(`❌ Error saving ${type}:`, error);
    }
}

// Auto-backup system
async function backupData() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(CONFIG.DATA_DIR, 'backups', timestamp);
    
    try {
        await fs.mkdir(backupDir, { recursive: true });
        
        for (const [key, data] of Object.entries(botData)) {
            if (typeof data === 'object') {
                const backupPath = path.join(backupDir, `${key}.json`);
                await fs.writeFile(backupPath, JSON.stringify(data, null, 2));
            }
        }
        console.log('💾 Data backup completed');
    } catch (error) {
        console.error('❌ Backup failed:', error);
    }
}

// Authentication system - IMPROVED
function extractPhoneNumber(jid) {
    // Extract just the phone number from various JID formats
    // Handles: 2348088866878@s.whatsapp.net, 2348088866878-1234567890@g.us (groups), etc.
    if (!jid) return null;
    return jid.split('@')[0].split('-')[0];
}

function isOwner(jid) {
    const phoneNumber = extractPhoneNumber(jid);
    return phoneNumber === CONFIG.OWNER_NUMBER;
}

function isAdmin(jid) {
    const phoneNumber = extractPhoneNumber(jid);
    return CONFIG.ADMIN_NUMBERS.includes(phoneNumber);
}

function isControlGroup(groupName) {
    if (!groupName) return false;
    return groupName.toLowerCase().includes(CONFIG.CONTROL_GROUP.toLowerCase());
}

function hasFeatureAccess(feature) {
    return botData.features.masterSwitch && botData.features[feature];
}

// Session management
function getUserSession(jid) {
    if (!botData.userSessions[jid]) {
        botData.userSessions[jid] = {
            currentMenu: 'main',
            lastActivity: Date.now(),
            breadcrumb: []
        };
    }
    return botData.userSessions[jid];
}

function updateUserSession(jid, menu, action = 'navigate') {
    const session = getUserSession(jid);
    
    if (action === 'navigate') {
        if (menu !== session.currentMenu) {
            session.breadcrumb.push(session.currentMenu);
        }
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
        return true;
    }
    return false;
}

// UI Rendering System
function renderMenu(menuName, userJid) {
    const isAdminUser = isAdmin(userJid);
    const isOwnerUser = isOwner(userJid);
    
    const menus = {
        main: `🎮 ═══════════════════ 🤖
║     MAIN MENU        ║
║                      ║
║  🎨 [1] Creative Hub ║
║  🎮 [2] Games Arena  ║
║  🛠️  [3] Utility Center║
║  📊 [4] Analytics    ║
║  🎭 [5] Fun Zone     ║
${isAdminUser ? '║  👑 [6] Admin Panel  ║' : ''}
║  ❓ [7] Help Center  ║
║                      ║
║  .help ? .admin 👑   ║
╚══════════════════════╝`,

        creative: `🎨 ═══════════════════ 🤖
║   CREATIVE HUB       ║
║                      ║
║  ✨ [1] ASCII Art    ║
║  🖼️  [2] Image → ASCII║
║  🤖 [3] Fake ChatGPT ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        games: `🎮 ═══════════════════ 🤖
║    GAMES ARENA       ║
║                      ║
║  ✂️  [1] Rock Paper   ║
║  🔢 [2] Number Guess ║
║  🧠 [3] Trivia Bot   ║
║  🔗 [4] Word Chain   ║
║  🎯 [5] Emoji Riddle ║
║  🏆 [6] Leaderboards ║
${isAdminUser ? '║  ⚙️  [7] Game Admin   ║' : ''}
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        utility: `🛠️ ═══════════════════ 🤖
║   UTILITY CENTER     ║
║                      ║
║  🌐 [1] Translator   ║
║  🎤 [2] Voice → Text ║
║  🔗 [3] Link Preview ║
║  ⏰ [4] Scheduler    ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        analytics: `📊 ═══════════════════ 🤖
║  ANALYTICS PANEL     ║
║                      ║
║  📈 [1] Group Stats  ║
║  👥 [2] User Activity║
║  ☁️  [3] Word Clouds  ║
║  📱 [4] My Stats     ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        fun: `🎭 ═══════════════════ 🤖
║     FUN ZONE         ║
║                      ║
║  🤣 [1] Dad Jokes    ║
║  🧠 [2] Random Facts ║
║  🔮 [3] Fortune Tell ║
║  😊 [4] Mood Detect  ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        admin: `👑 ═══════════════════ 🤖
║    ADMIN PANEL       ║
║                      ║
║  👥 [1] User Mgmt    ║
║  ⚙️  [2] Features     ║
║  🎮 [3] Game Mgmt    ║
${isOwnerUser ? '║  📊 [4] Stock Toggle ║' : ''}
║  🔴 [5] Kill Switch  ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`,

        help: `❓ ═══════════════════ 🤖
║    HELP CENTER       ║
║                      ║
║  📖 [1] Commands     ║
║  🎮 [2] Game Guide   ║
║  🛠️  [3] Features     ║
║  🆘 [4] Troubleshoot ║
║                      ║
║  .back ← .menu 🏠    ║
╚══════════════════════╝`
    };

    return menus[menuName] || menus.main;
}

// Message processing utilities
function getRandomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function sendMessageWithDelay(sock, jid, content, minDelay = 1000, maxDelay = 3000) {
    const delay = getRandomDelay(minDelay, maxDelay);
    
    setTimeout(async () => {
        try {
            await sock.sendMessage(jid, content);
        } catch (error) {
            console.error('❌ Error sending message:', error);
        }
    }, delay);
}

// Stock count system (preserved functionality)
function isStockCountMessage(text) {
    if (!text) return false;
    return text.toLowerCase().includes('new stock count');
}

function getMessageKey(msg) {
    return `${msg.key.remoteJid}_${msg.key.id}`;
}

async function handleStockCountReaction(sock, msg) {
    if (!hasFeatureAccess('stockCount')) return;
    
    try {
        await sock.sendMessage(msg.key.remoteJid, {
            react: { text: '👍', key: msg.key }
        });
        
        const msgKey = getMessageKey(msg);
        if (!botData.reactionCounters[msgKey]) {
            botData.reactionCounters[msgKey] = {
                count: 0,
                hasReplied: false,
                messageText: msg.message.conversation?.substring(0, 50) + '...' || 'Stock count message'
            };
            await saveData('reactionCounters');
        }
    } catch (error) {
        console.error('❌ Error handling stock count reaction:', error);
    }
}

// Command processor
async function processCommand(sock, msg, command, args) {
    const jid = msg.key.remoteJid;
    const userJid = msg.key.participant || jid;
    
    // Debug logging for admin recognition
    const phoneNumber = extractPhoneNumber(userJid);
    const isOwnerUser = isOwner(userJid);
    const isAdminUser = isAdmin(userJid);
    
    console.log(`📞 User: ${phoneNumber}, Owner: ${isOwnerUser}, Admin: ${isAdminUser}`);
    
    try {
        // Check session timeout
        if (checkSessionTimeout(userJid)) {
            await sendMessageWithDelay(sock, jid, { 
                text: '⏰ Session timed out. Returning to main menu.' 
            }, 500, 1000);
        }
        
        const session = getUserSession(userJid);
        
        // Universal commands
        switch (command) {
            case 'menu':
            case 'home':
                updateUserSession(userJid, 'main');
                await sendMessageWithDelay(sock, jid, { text: renderMenu('main', userJid) });
                return;
                
            case 'back':
                updateUserSession(userJid, '', 'back');
                const currentMenu = getUserSession(userJid).currentMenu;
                await sendMessageWithDelay(sock, jid, { text: renderMenu(currentMenu, userJid) });
                return;
                
            case 'help':
                await sendMessageWithDelay(sock, jid, { 
                    text: `❓ HELP - Available Commands:
                    
🔹 .menu / .home → Main menu
🔹 .back → Previous menu  
🔹 .help → This help message
🔹 .admin → Admin panel (admins only)

📱 Navigate using numbers [1], [2], etc.
⏰ Menus auto-reset after 5 minutes
🎮 Have fun exploring!` 
                });
                return;
                
            case 'admin':
                if (!isAdmin(userJid)) {
                    console.log(`❌ Admin access denied for ${extractPhoneNumber(userJid)}`);
                    return; // Silent ignore
                }
                console.log(`✅ Admin access granted for ${extractPhoneNumber(userJid)}`);
                updateUserSession(userJid, 'admin');
                await sendMessageWithDelay(sock, jid, { text: renderMenu('admin', userJid) });
                return;
                
            case 'debug':
                // Debug command to check admin status
                if (!isAdmin(userJid)) return;
                const debugInfo = `🔍 DEBUG INFO:
📞 Your number: ${extractPhoneNumber(userJid)}
👑 Owner status: ${isOwner(userJid) ? '✅' : '❌'}
🛡️ Admin status: ${isAdmin(userJid) ? '✅' : '❌'}
💬 Chat type: ${jid.includes('@g.us') ? 'Group' : 'DM'}
🆔 Your JID: ${userJid}`;
                await sendMessageWithDelay(sock, jid, { text: debugInfo });
                return;
        }
        
        // Number-based menu navigation
        if (/^[1-7]$/.test(command)) {
            const choice = parseInt(command);
            await handleMenuNavigation(sock, jid, userJid, session.currentMenu, choice);
            return;
        }
        
        // If command not recognized, show current menu
        await sendMessageWithDelay(sock, jid, { text: renderMenu(session.currentMenu, userJid) });
        
    } catch (error) {
        console.error('❌ Command processing error:', error);
        await sendMessageWithDelay(sock, jid, { 
            text: '⚠️ Something went wrong. Please try again or type .menu' 
        });
    }
}

// Menu navigation handler
async function handleMenuNavigation(sock, jid, userJid, currentMenu, choice) {
    const isAdminUser = isAdmin(userJid);
    
    try {
        switch (currentMenu) {
            case 'main':
                const mainMenus = ['creative', 'games', 'utility', 'analytics', 'fun'];
                if (choice <= 5 && hasFeatureAccess(mainMenus[choice - 1])) {
                    updateUserSession(userJid, mainMenus[choice - 1]);
                    await sendMessageWithDelay(sock, jid, { text: renderMenu(mainMenus[choice - 1], userJid) });
                } else if (choice === 6 && isAdminUser) {
                    updateUserSession(userJid, 'admin');
                    await sendMessageWithDelay(sock, jid, { text: renderMenu('admin', userJid) });
                } else if (choice === 7) {
                    updateUserSession(userJid, 'help');
                    await sendMessageWithDelay(sock, jid, { text: renderMenu('help', userJid) });
                }
                break;
                
            case 'creative':
                if (choice === 1) {
                    await sendMessageWithDelay(sock, jid, { 
                        text: '🎨 ASCII Art Generator\n\nSend any text and I\'ll convert it to ASCII art!\nExample: Send "HELLO" to see it in ASCII style.' 
                    });
                } else if (choice === 2) {
                    await sendMessageWithDelay(sock, jid, { 
                        text: '🖼️ Image → ASCII Converter\n\nSend me any image and I\'ll convert it to ASCII art!\nNote: Works best with high contrast images.' 
                    });
                } else if (choice === 3) {
                    await sendMessageWithDelay(sock, jid, { 
                        text: '🤖 Fake ChatGPT Mode Activated!\n\nI\'ll respond to your messages in AI assistant style. Ask me anything!' 
                    });
                }
                break;
                
            case 'admin':
                if (!isAdminUser) return;
                await handleAdminCommands(sock, jid, userJid, choice);
                break;
                
            default:
                await sendMessageWithDelay(sock, jid, { 
                    text: '🚧 Feature coming soon!\n\nThis section is under development.' 
                });
        }
    } catch (error) {
        console.error('❌ Navigation error:', error);
        await sendMessageWithDelay(sock, jid, { text: '⚠️ Navigation error. Type .menu to restart.' });
    }
}

// Admin command handler
async function handleAdminCommands(sock, jid, userJid, choice) {
    const isOwnerUser = isOwner(userJid);
    
    try {
        switch (choice) {
            case 1: // User Management
                const userCount = Object.keys(botData.userSessions).length;
                await sendMessageWithDelay(sock, jid, { 
                    text: `👥 USER MANAGEMENT\n\n📊 Active Users: ${userCount}\n👑 Admins: ${botData.admins.length}\n\n🔧 Management options coming soon!` 
                });
                break;
                
            case 2: // Feature Toggles
                const features = Object.entries(botData.features)
                    .map(([key, value]) => `${value ? '✅' : '❌'} ${key}`)
                    .join('\n');
                await sendMessageWithDelay(sock, jid, { 
                    text: `⚙️ FEATURE TOGGLES\n\n${features}\n\n🔧 Toggle controls coming soon!` 
                });
                break;
                
            case 3: // Game Management
                await sendMessageWithDelay(sock, jid, { 
                    text: '🎮 GAME MANAGEMENT\n\n🏆 Leaderboards\n🎯 Active Games\n⚙️ Settings\n\n🔧 Full game controls coming soon!' 
                });
                break;
                
            case 4: // Stock Toggle (Owner only)
                if (!isOwnerUser) return;
                botData.features.stockCount = !botData.features.stockCount;
                await saveData('features');
                await sendMessageWithDelay(sock, jid, { 
                    text: `📊 STOCK COUNT: ${botData.features.stockCount ? '✅ ENABLED' : '❌ DISABLED'}` 
                });
                break;
                
            case 5: // Kill Switch
                botData.features.masterSwitch = !botData.features.masterSwitch;
                await saveData('features');
                await sendMessageWithDelay(sock, jid, { 
                    text: `🔴 MASTER SWITCH: ${botData.features.masterSwitch ? '✅ ONLINE' : '❌ OFFLINE'}` 
                });
                break;
        }
    } catch (error) {
        console.error('❌ Admin command error:', error);
        await sendMessageWithDelay(sock, jid, { text: '⚠️ Admin command failed. Please try again.' });
    }
}

async function startBot() {
    // Initialize data system
    await initializeDataSystem();
    
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false,
        browser: ["WhatsApp Advanced Bot", "Chrome", "1.0.0"],
    });

    // Connection handling
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed, reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Bot connected successfully!');
            console.log('🎮 Advanced menu system ready!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    // Message handling
    sock.ev.on('messages.upsert', async (m) => {
        try {
            const msg = m.messages[0];
            
            if (!msg || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') {
                return;
            }

            if (!msg.message) {
                console.log('⚠️ Received message without content');
                return;
            }

            const messageType = Object.keys(msg.message)[0];
            
            if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                const userJid = msg.key.participant || msg.key.remoteJid;
                
                // Log command usage
                botData.analytics.commandUsage[userJid] = (botData.analytics.commandUsage[userJid] || 0) + 1;
                
                // Handle stock count messages
                if (isStockCountMessage(text)) {
                    await handleStockCountReaction(sock, msg);
                }
                
                // Process bot commands
                if (text && text.startsWith('.')) {
                    const parts = text.slice(1).split(' ');
                    const command = parts[0].toLowerCase();
                    const args = parts.slice(1);
                    
                    await processCommand(sock, msg, command, args);
                }
            }
        } catch (error) {
            console.error('❌ Message processing error:', error);
        }
    });

    // Reaction handling (stock count system)
    sock.ev.on('messages.reaction', async (reactions) => {
        try {
            for (const reaction of reactions) {
                const msgKey = `${reaction.key.remoteJid}_${reaction.key.id}`;
                
                if (botData.reactionCounters[msgKey]) {
                    if (reaction.reaction.text) {
                        botData.reactionCounters[msgKey].count += 1;
                    } else {
                        botData.reactionCounters[msgKey].count = Math.max(0, botData.reactionCounters[msgKey].count - 1);
                    }
                    
                    await saveData('reactionCounters');
                    
                    if (botData.reactionCounters[msgKey].count === 10 && !botData.reactionCounters[msgKey].hasReplied) {
                        await sendMessageWithDelay(
                            sock,
                            reaction.key.remoteJid,
                            { text: 'Number of stock counters reached: 10' },
                            2000,
                            4000
                        );
                        
                        botData.reactionCounters[msgKey].hasReplied = true;
                        await saveData('reactionCounters');
                    }
                }
            }
        } catch (error) {
            console.error('❌ Reaction processing error:', error);
        }
    });

    return sock;
}

// Start the bot
console.log('🚀 Starting Advanced WhatsApp Bot...');
console.log('🎮 Loading menu system...');
startBot().catch(err => {
    console.error('❌ Bot startup error:', error);
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
