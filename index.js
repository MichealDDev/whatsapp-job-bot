const {
    default: makeWASocket,
    useMultiFileAuthState,
    DisconnectReason,
    jidNormalizedUser,
    makeCacheableSignalKeyStore,
    fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');

console.log('🚀 KANGO-Style WhatsApp Bot Starting...');

// Configuration
const TARGET_GROUP_NAME = process.env.GROUP_NAME || 'MEME COINS';
const SESSION_ID = process.env.SESSION_ID || '';

// Create logger (Railway compatible)
const logger = pino({
    level: 'silent'
});

// Auth directory
const AUTH_DIR = './session';

async function startBot() {
    try {
        // Ensure auth directory exists
        if (!fs.existsSync(AUTH_DIR)) {
            fs.mkdirSync(AUTH_DIR, { recursive: true });
        }

        // Handle session restoration from SESSION_ID if provided
        if (SESSION_ID && !fs.existsSync(`${AUTH_DIR}/creds.json`)) {
            try {
                console.log('📱 Restoring session from SESSION_ID...');
                const sessionData = Buffer.from(SESSION_ID, 'base64').toString('utf-8');
                const sessionJson = JSON.parse(sessionData);
                fs.writeFileSync(`${AUTH_DIR}/creds.json`, JSON.stringify(sessionJson, null, 2));
                console.log('✅ Session restored successfully');
            } catch (error) {
                console.log('⚠️ Could not restore session, will generate new QR');
            }
        }

        const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger.child({ level: 'silent', stream: 'store' }))
            },
            logger: logger.child({ level: 'silent', stream: 'main' }),
            printQRInTerminal: true,
            browser: ['KANGO Bot', 'Chrome', '1.0.0'],
            generateHighQualityLinkPreview: false,
            syncFullHistory: false,
            markOnlineOnConnect: false,
            keepAliveIntervalMs: 60000,
            defaultQueryTimeoutMs: 60000,
            retryRequestDelayMs: 250
        });

        // Save credentials
        sock.ev.on('creds.update', saveCreds);

        // Connection handling
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('📱 QR Code generated! Scan with WhatsApp:');
                // Generate session ID from creds for easy Railway deployment
                if (state.creds) {
                    try {
                        const sessionString = Buffer.from(JSON.stringify(state.creds)).toString('base64');
                        console.log('💾 SESSION_ID for Railway:', sessionString.substring(0, 50) + '...');
                    } catch (e) {
                        // Silent fail
                    }
                }
            }

            if (connection === 'close') {
                const reason = lastDisconnect?.error?.output?.statusCode;
                
                console.log('⚠️ Connection closed:', reason);
                
                if (reason === DisconnectReason.badSession) {
                    console.log('❌ Bad session, deleting and restarting...');
                    if (fs.existsSync(AUTH_DIR)) {
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    }
                } else if (reason === DisconnectReason.connectionClosed) {
                    console.log('🔄 Connection closed, reconnecting...');
                    setTimeout(startBot, 3000);
                    return;
                } else if (reason === DisconnectReason.connectionLost) {
                    console.log('🔄 Connection lost, reconnecting...');
                    setTimeout(startBot, 3000);
                    return;
                } else if (reason === DisconnectReason.connectionReplaced) {
                    console.log('🔄 Connection replaced, restarting...');
                } else if (reason === DisconnectReason.loggedOut) {
                    console.log('❌ Logged out, deleting session...');
                    if (fs.existsSync(AUTH_DIR)) {
                        fs.rmSync(AUTH_DIR, { recursive: true, force: true });
                    }
                } else if (reason === DisconnectReason.restartRequired) {
                    console.log('🔄 Restart required...');
                } else {
                    console.log('🔄 Reconnecting...');
                }
                
                setTimeout(startBot, 5000);
                
            } else if (connection === 'open') {
                console.log('✅ Successfully Connected to WhatsApp!');
                console.log(`🎯 Monitoring group: "${TARGET_GROUP_NAME}"`);
                console.log('🤖 Bot is ready to auto-like messages!');
            }
        });

        // Message handler
        sock.ev.on('messages.upsert', async ({ messages, type }) => {
            if (type !== 'notify') return;

            for (const message of messages) {
                if (!message.message || message.key.fromMe) continue;

                try {
                    await handleMessage(sock, message);
                } catch (error) {
                    console.error('❌ Message handling error:', error.message);
                }
            }
        });

    } catch (error) {
        console.error('❌ Bot setup error:', error);
        setTimeout(startBot, 10000);
    }
}

async function handleMessage(sock, message) {
    try {
        const jid = message.key.remoteJid;
        
        // Only process group messages
        if (!jid?.endsWith('@g.us')) return;

        // Get group metadata
        const groupMetadata = await sock.groupMetadata(jid);
        
        // Check if it's our target group
        if (groupMetadata.subject !== TARGET_GROUP_NAME) return;

        console.log(`📨 New message in ${TARGET_GROUP_NAME}!`);
        
        // Auto-react with thumbs up
        await sock.sendMessage(jid, {
            react: {
                text: '👍',
                key: message.key
            }
        });

        console.log('✅ Auto-liked message successfully!');
        
        const timestamp = new Date().toLocaleString();
        console.log(`[${timestamp}] Reacted to message in ${TARGET_GROUP_NAME}`);

    } catch (error) {
        console.error('❌ Handle message error:', error.message);
    }
}

// Start bot
console.log('⏳ Initializing bot...');
startBot();

// Keep alive with periodic restart (Railway optimization)
setInterval(() => {
    console.log('🔄 Periodic restart for Railway optimization...');
    process.exit(0);
}, 4 * 60 * 60 * 1000); // 4 hours

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, shutting down...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 SIGINT received, shutting down...');
    process.exit(0);
});
