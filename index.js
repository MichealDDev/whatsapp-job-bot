const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const P = require('pino');

// Create logger
const logger = P({ level: 'silent' });

async function startBot() {
    // Use multi-file auth state to save session
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    
    const sock = makeWASocket({
        auth: state,
        logger,
        printQRInTerminal: false, // We'll handle QR code display manually
        browser: ["WhatsApp Bot", "Chrome", "1.0.0"], // Identify as a bot
    });

    // Handle QR code display
    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;
        
        if (qr) {
            console.log('📱 Scan this QR code with WhatsApp:');
            qrcode.generate(qr, { small: true });
        }
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('❌ Connection closed due to ', lastDisconnect?.error, ', reconnecting:', shouldReconnect);
            
            if (shouldReconnect) {
                setTimeout(startBot, 3000); // Restart after 3 seconds
            }
        } else if (connection === 'open') {
            console.log('✅ WhatsApp bot connected successfully!');
            console.log('🤖 Bot is now ready to receive messages');
        }
    });

    // Save credentials when updated
    sock.ev.on('creds.update', saveCreds);

    // Handle incoming messages
    sock.ev.on('messages.upsert', async (m) => {
        const msg = m.messages[0];
        
        // Ignore if message is from status broadcast or if it's from us
        if (!msg.key.fromMe && msg.key.remoteJid !== 'status@broadcast') {
            const messageType = Object.keys(msg.message)[0];
            
            // Only respond to text messages for now
            if (messageType === 'conversation' || messageType === 'extendedTextMessage') {
                const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
                const sender = msg.key.remoteJid;
                
                console.log(`📨 Message from ${sender}: ${text}`);
                
                // Simple auto-reply (you can customize this)
                if (text?.toLowerCase().includes('hello') || text?.toLowerCase().includes('hi')) {
                    await sock.sendMessage(sender, { 
                        text: '👋 Hello! I\'m a WhatsApp bot. I\'m currently in development mode.' 
                    });
                }
            }
        }
    });

    return sock;
}

// Start the bot
console.log('🚀 Starting WhatsApp bot...');
startBot().catch(err => {
    console.error('❌ Error starting bot:', err);
});

// Handle process termination gracefully
process.on('SIGINT', () => {
    console.log('\n👋 Bot shutting down gracefully...');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n👋 Bot shutting down gracefully...');
    process.exit(0);
});
