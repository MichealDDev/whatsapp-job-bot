const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');

console.log('🚀 Starting minimal WhatsApp bot...');

const TARGET_GROUP = process.env.GROUP_NAME || 'MEME COINS';

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('./auth');
    
    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: true
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
            if (shouldReconnect) {
                console.log('🔄 Reconnecting...');
                setTimeout(startBot, 3000);
            }
        } else if (connection === 'open') {
            console.log('✅ Connected! Monitoring group:', TARGET_GROUP);
        }
    });

    sock.ev.on('messages.upsert', async (m) => {
        for (const msg of m.messages) {
            if (!msg.message || msg.key.fromMe) continue;
            
            try {
                // Check if it's from a group
                if (msg.key.remoteJid?.includes('@g.us')) {
                    const groupInfo = await sock.groupMetadata(msg.key.remoteJid);
                    
                    if (groupInfo.subject === TARGET_GROUP) {
                        console.log('📨 New message in target group!');
                        
                        await sock.sendMessage(msg.key.remoteJid, {
                            react: { text: '👍', key: msg.key }
                        });
                        
                        console.log('✅ Reacted with 👍');
                    }
                }
            } catch (error) {
                console.error('❌ Error:', error.message);
            }
        }
    });
}

startBot().catch(console.error);
