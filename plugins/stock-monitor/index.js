const fs = require('fs').promises;
const path = require('path');

const COUNTER_FILE = path.join(__dirname, '../../data/state/reaction-counters.json');
const ALERT_LOG = path.join(__dirname, '../../data/logs/stock-alerts.log');

let reactionCounters = {};

async function loadCounters() {
  try {
    const data = await fs.readFile(COUNTER_FILE, 'utf8');
    reactionCounters = JSON.parse(data);
  } catch (e) {
    reactionCounters = {};
    await saveCounters();
  }
}

async function saveCounters() {
  await fs.writeFile(COUNTER_FILE, JSON.stringify(reactionCounters, null, 2));
}

function getKey(msg) {
  return `${msg.key.remoteJid}_${msg.key.id}`;
}

async function sendOwnerAlert(sock, content) {
  const ownerNumber = require('../../data/config/admins.json').owner;
  const ownerJid = jid(ownerNumber);
  await sock.sendMessage(ownerJid, { text: content });
  await fs.appendFile(ALERT_LOG, `[${new Date().toISOString()}] ${content}\n`);
}

async function init(sock) {
  await loadCounters();

  sock.ev.on('messages.upsert', async (m) => {
    const msg = m.messages[0];
    if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') return;

    const text = msg.message.conversation || msg.message.extendedTextMessage?.text || '';
    const sender = msg.key.remoteJid;

    // Only owner can toggle stock monitor
    if (text === '.stock on' || text === '.stock off') {
      if (getRole(sender) !== 'owner') return;
      const isEnabled = text === '.stock on';
      await sock.sendMessage(sender, { text: `✅ Stock monitor is now ${isEnabled ? 'ON' : 'OFF'}` });
      return;
    }

    // Detect "new stock count"
    if (text.toLowerCase().includes('new stock count')) {
      // React instantly
      await sock.sendMessage(sender, {
        react: { text: '👍', key: msg.key }
      });

      const key = getKey(msg);
      if (!reactionCounters[key]) {
        reactionCounters[key] = {
          id: `SC-${Math.floor(1000 + Math.random() * 9000)}`,
          text: text.length > 50 ? text.slice(0, 50) + '...' : text,
          count: 0,
          reached10: false,
          detectedAt: new Date().toISOString()
        };
        await saveCounters();

        // Send alert to Owner only (via DM)
        await sendOwnerAlert(sock, `📡 STOCK SIGNAL DETECTED\n🔹 ID: ${reactionCounters[key].id}\n🔹 Message: "${reactionCounters[key].text}"\n🔹 Status: Awaiting 10 counters\n🔹 Time: ${new Date().toLocaleTimeString()}`);
      }
    }
  });

  // Reaction handler
  sock.ev.on('messages.reaction', async (reactions) => {
    for (const reaction of reactions) {
      const key = `${reaction.key.remoteJid}_${reaction.key.id}`;
      if (!reactionCounters[key]) continue;
      const counter = reactionCounters[key];
      if (counter.reached10) continue;

      if (reaction.reaction.text) counter.count += 1;
      else counter.count = Math.max(0, counter.count - 1);

      await saveCounters();

      if (counter.count === 10 && !counter.reached10) {
        counter.reached10 = true;
        await saveCounters();
        await sendOwnerAlert(sock, `✅ STOCK CONFIRMED\n🔹 ID: ${counter.id}\n🔹 Total Counters: 10\n🔹 Message: "${counter.text}"\n🔹 Time: ${new Date().toLocaleTimeString()}\n\n🟢 Restock may proceed.`);
      }
    }
  });
}

module.exports = { init };
