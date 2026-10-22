/* ═══════════════════════════════════════════════════════════════════
   J.A.R.V.I.S — WhatsApp Bridge (Green API)
   ═══════════════════════════════════════════════════════════════════ */

// Node 18+ has fetch built-in, no need for node-fetch
const fetch = global.fetch || require('node-fetch');

// ── CONFIG — החלף את הערכים כאן ──
const ID_INSTANCE = '710722775069'; // ← ה-ID שלך
const API_TOKEN = '171f7389761e491d8ad297574cef7a1d38443f6fb7874614b7'; // ← הטוקן שחילצת

const JARVIS_API_URL = 'http://localhost:3000/api/ask';
const BASE_URL = `https://api.green-api.com/waInstance${ID_INSTANCE}`;

// ── Helper: Send message ──
async function sendWhatsAppMessage(chatId, message) {
    const url = `${BASE_URL}/sendMessage/${API_TOKEN}`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId, message })
        });
    } catch (err) {
        console.error('[WhatsApp] Send failed:', err.message);
    }
}

// ── Helper: Receive messages ──
async function receiveMessages() {
    const url = `${BASE_URL}/receiveNotification/${API_TOKEN}`;
    try {
        const res = await fetch(url);
        if (!res.ok) return null;

        // קרא את הטקסט קודם
        const text = await res.text();

        // אם התשובה ריקה או null — אין הודעות חדשות
        if (!text || text.trim() === 'null' || text.trim() === '') {
            return null;
        }

        // רק עכשיו נסה לפרש כ-JSON
        return JSON.parse(text);
    } catch (err) {
        console.error('[WhatsApp] Receive failed:', err.message);
        return null;
    }
}

// ── Helper: Delete notification ──
async function deleteNotification(receiptId) {
    const url = `${BASE_URL}/deleteNotification/${API_TOKEN}/${receiptId}`;
    try {
        await fetch(url, { method: 'DELETE' });
    } catch (err) {
        console.error('[WhatsApp] Delete failed:', err.message);
    }
}

// ── Main loop ──
async function main() {
    console.log('[WhatsApp] Bridge started. Waiting for messages...');

    while (true) {
        const notification = await receiveMessages();

        if (notification && notification.body) {
            const body = notification.body;
            const typeWebhook = body.typeWebhook;
            const senderData = body.senderData;
            const messageData = body.messageData;

            // Only handle incoming text messages
            if (
                typeWebhook === 'incomingMessageReceived' &&
                messageData.typeMessage === 'textMessage' &&
                senderData.chatId !== senderData.sender
            ) {
                const chatId = senderData.chatId;
                const text = messageData.textMessageData.textMessage;

                console.log(`[WhatsApp] Message from ${chatId}: ${text}`);

                // Send to J.A.R.V.I.S
                try {
                    const response = await fetch(JARVIS_API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ query: text })
                    });
                    const data = await response.json();

                    const reply = data.reply || 'אדוני, לא הצלחתי להבין.';
                    await sendWhatsAppMessage(chatId, reply);
                } catch (err) {
                    console.error('[WhatsApp] J.A.R.V.I.S error:', err.message);
                    await sendWhatsAppMessage(chatId, 'אדוני, יש בעיה בחיבור למערכת.');
                }
            }

            // Delete the notification so we don't process it again
            if (notification.receiptId) {
                await deleteNotification(notification.receiptId);
            }
        }

        // Wait 3 seconds before checking again
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
}

main();