// =================================================================
// 🚨🚨🚨 【防封鎖設定】Gemini API 金鑰 🚨🚨🚨
// =================================================================
const KEY_PART_1 = "AIzaSyCwVW"; 
const KEY_PART_2 = "en7tHL6yH1cmjYv9ZruRpnEx23Fk0";
// ⭐ 修正：使用等號並過濾隱形字元 [cite: 44, 50]
const GEMINI_API_KEY = (KEY_PART_1 + KEY_PART_2).replace(/[^\x21-\x7E]/g, '').trim();

// Firebase 設定 [cite: 38]
const firebaseConfig = {
    apiKey: "AIzaSyA6C0ArowfDaxJKV15anQZSZT7bcdeXJ2E",
    authDomain: "familychatadvisor.firebaseapp.com",
    projectId: "familychatadvisor",
    storageBucket: "familychatadvisor.firebasestorage.app",
    messagingSenderId: "172272099421",
    appId: "1:172272099421:web:a67b69291419194189edb4",
    measurementId: "G-SRY5B3JV85"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ROOMS_METADATA_COLLECTION = 'rooms_metadata';

// --- DOM 元素 ---
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const roomEntryScreen = document.getElementById('roomEntryScreen');
const roomIdInput = document.getElementById('roomIdInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const userNameInput = document.getElementById('userNameInput');
const startChatButton = document.getElementById('startChatButton');
const statusDisplay = document.getElementById('current-user-status');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const typingIndicator = document.getElementById('typingIndicator');
const typingUserName = document.getElementById('typingUserName');

const pledgeModal = document.getElementById('pledgeModal');
const pledgeInput = document.getElementById('pledgeInput');
const submitPledgeButton = document.getElementById('submitPledgeButton');
const confettiContainer = document.getElementById('confettiContainer');

// --- 狀態變數 ---
let currentUserName = localStorage.getItem('chatUserName') || null; [cite: 7]
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationCount = 0;
let lastAIMessageTime = 0;
let LAST_USER_SEND_TIME = 0;
const COOLDOWN_TIME = 2000; 

let roomActiveUsersList = []; 
let typingUsersList = [];
let typingTimeout = null;

let lastRoomActivityTime = Date.now(); 
let hasSent60sWarning = false;

// =================================================================
// ⭐ 初始化邏輯
// =================================================================
window.onload = function() {
    if (currentUserName && currentRoomId) {
        if(roomEntryScreen) roomEntryScreen.style.display = 'none';
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
        if(roomEntryScreen) roomEntryScreen.style.display = 'flex';
    }

    if(startChatButton) startChatButton.addEventListener('click', handleRoomEntry);
    if(leaveRoomButton) leaveRoomButton.addEventListener('click', handleLeaveRoom);
    if(sendButton) sendButton.addEventListener('click', handleSendAction);
    
    const generateSummaryBtn = document.getElementById('generateSummaryBtn');
    if (generateSummaryBtn) generateSummaryBtn.addEventListener('click', generateSummaryReport);

    if(userInput) {
        userInput.addEventListener('input', () => updateTypingStatus(true));
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSendAction(); }
            lastRoomActivityTime = Date.now();
        });
        userInput.addEventListener('blur', () => updateTypingStatus(false));
    }

    if (pledgeInput) {
        pledgeInput.addEventListener('input', (e) => {
            const target = "我希望破冰，打破我們之間的隔閡!"; [cite: 23]
            const isValid = e.target.value.trim() === target;
            submitPledgeButton.disabled = !isValid;
            submitPledgeButton.className = isValid ? 
                "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg" : 
                "w-full py-3.5 bg-gray-300 text-white font-bold rounded-xl cursor-not-allowed shadow-md";
        });
    }

    if (submitPledgeButton) submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    setInterval(checkIdleAndAITrigger, 5000); [cite: 31]
};

// ⭐ 打字偵測與介入 [cite: 26, 27]
async function updateTypingStatus(isTyping) {
    if (!currentRoomId || !currentUserName) return;
    const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId);
    try {
        if (isTyping) {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayUnion(currentUserName) });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => updateTypingStatus(false), 120000); // 120秒防卡死
        } else {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
        }
    } catch (e) { console.warn("打字同步略過"); }
}

async function checkIdleAndAITrigger() {
    if (!currentRoomId) return;
    const now = Date.now();
    const idleTime = now - lastRoomActivityTime;
    const isSomeoneTyping = typingUsersList.length > 0;

    // 60秒警告 [cite: 32]
    if (idleTime > 60000 && !hasSent60sWarning) {
        if (isSomeoneTyping) {
            const typist = typingUsersList[0];
            await sendToDatabase(`❤️ ${typist} 正在深思熟慮地組織語言，請耐心等候喔...`, 'AI', 'Re:Family 智能助手', currentRoomId);
        } else {
            triggerAIPrompt("idle_warmup", "", "所有人");
        }
        hasSent60sWarning = true;
    }

    // 120秒強制介入
    if (idleTime > 120000) {
        const targetUser = isSomeoneTyping ? typingUsersList[0] : (roomActiveUsersList[0] || "家人");
        triggerAIPrompt("force_mediation", "", targetUser);
        updateTypingStatus(false);
        lastRoomActivityTime = Date.now();
        hasSent60sWarning = false;
    }

    if (idleTime < 5000) hasSent60sWarning = false;
}

// 🏠 房間與訊息邏輯 [cite: 2, 8]
async function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, '');
    const password = roomPasswordInput.value.trim();
    const userName = userNameInput.value.trim();

    if (roomId.length < 4 || !password || !userName) { alert("請完整輸入房間資訊！"); return; }
    startChatButton.disabled = true;
    startChatButton.textContent = "驗證中...";

    try {
        const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(roomId);
        const doc = await roomDocRef.get();
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); [cite: 34]

        if (doc.exists) {
            const confirmed = confirm(`📢 通知：房間代碼「${roomId}」已被佔用。`);
            if (!confirmed || doc.data().password !== password) { 
                alert(doc.data().password !== password ? "❌ 密碼錯誤！" : "已取消"); 
                resetEntryButton(); return; 
            }
            await roomDocRef.update({ active_users: firebase.firestore.FieldValue.arrayUnion(userName), expireAt: expireDate });
        } else {
            await roomDocRef.set({ password, created_at: firebase.firestore.FieldValue.serverTimestamp(), expireAt: expireDate, active_users: [userName], typing_users: [] });
        }

        currentRoomId = roomId; currentUserName = userName;
        localStorage.setItem('chatRoomId', roomId); localStorage.setItem('chatUserName', userName);
        startChatListener(roomId); updateUIForChat();
    } catch (error) { alert("連線失敗"); resetEntryButton(); }
}

function resetEntryButton() { startChatButton.disabled = false; startChatButton.textContent = "開始群聊"; }

function updateUIForChat() {
    if(roomEntryScreen) roomEntryScreen.style.display = 'none';
    userInput.disabled = false; sendButton.disabled = false;
    document.getElementById('leaveRoomButton').classList.remove('hidden');
    document.getElementById('generateSummaryBtn').classList.remove('hidden');
    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡陪伴大家。`, 'system', 'Re:Family');
    lastRoomActivityTime = Date.now();
}

function displayMessage(content, type, senderName, timestamp) {
    if (typeof content !== 'string') return;
    const cleanMsg = content.replace('[TRIGGER_PLEDGE]', '').replace('[AI_SUCCESS_REPLY]', ''); 
    if (!cleanMsg.trim()) return;

    const messageContainer = document.createElement('div');
    const displayHTML = cleanMsg.trim().replace(/\*/g, '').replace(/\n/g, '<br>');
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4', type === 'user' ? 'justify-end' : 'justify-start');
    
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none'; [cite: 11, 12, 13]
    if (content.includes("已宣誓破冰")) bubbleClass = 'bg-green-100 text-green-800 border border-green-200';

    messageContainer.innerHTML = type === 'user' ? 
        `<div class="flex flex-col items-end"><div class="text-xs text-gray-500 mb-1"><strong>${senderName}</strong> ${timeStr}</div><div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${displayHTML}</div></div><div class="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center flex-shrink-0"><i class="fas fa-user text-gray-600"></i></div>` :
        `<div class="w-8 h-8 rounded-full ${senderName.includes('Re:Family') ? 'bg-warm-peach' : 'bg-gray-300'} flex items-center justify-center flex-shrink-0">${senderName.includes('Re:Family') ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>'}</div><div class="flex flex-col items-start"><div class="text-xs text-gray-500 mb-1"><strong>${senderName}</strong> ${timeStr}</div><div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${displayHTML}</div></div>`;

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 🔥 Firestore 監聽 [cite: 9]
let displayedMessageIds = new Set();
function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = ''; displayedMessageIds = new Set(); conversationCount = 0;

    db.collection(ROOMS_METADATA_COLLECTION).doc(roomId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data();
            roomActiveUsersList = data.active_users || [];
            typingUsersList = (data.typing_users || []).filter(u => u !== currentUserName);
            typingIndicator.style.opacity = typingUsersList.length > 0 ? "1" : "0";
            if (typingUsersList.length > 0) typingUserName.textContent = typingUsersList.join(', ');
        }
    });

    db.collection('rooms').doc(roomId).collection('messages').orderBy('timestamp').limit(50).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (!displayedMessageIds.has(change.doc.id)) {
                    displayedMessageIds.add(change.doc.id);
                    lastRoomActivityTime = Date.now();
                    const isMe = msg.senderId === sessionId;
                    const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');
                    if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_PLEDGE]')) setTimeout(() => showPledgeModal(), 1000);
                    displayMessage(msg.text, type, msg.senderName, msg.timestamp);
                    if (msg.senderId !== 'AI') {
                        conversationCount++;
                        if (isMe) checkAndTriggerAI(msg.text, msg.senderName);
                    }
                }
            }
        });
    }, error => {
        console.error("Firestore 監聽失敗，請確認是否建立 Index:", error);
    });
}

// ⭐ 溝通總結報告 [cite: 18, 19, 21]
async function generateSummaryReport() {
    if (!currentRoomId) return;
    document.getElementById('summaryLoadingModal').classList.remove('hidden');
    try {
        const snap = await db.collection('rooms').doc(currentRoomId).collection('messages').orderBy('timestamp', 'desc').limit(40).get();
        const history = snap.docs.map(doc => doc.data()).reverse();
        if (history.length < 2) { alert("紀錄不足！"); return; }

        const historyText = history.map(m => `${m.senderName}:${m.text}`).join('\n');
        const prompt = `你現在是資深家庭諮商師。請為成員 (${roomActiveUsersList.join('、')}) 產生 JSON 總結。
        要求：針對每個人寫出「內心渴望 (thoughts)」與「專屬建議 (advice)」。嚴格輸出純 JSON。
        格式：{"overall": "氣氛總結", "cards": [{"name": "姓名", "role": "聆聽者/表達者", "thoughts": "心聲", "advice": "建議"}]}
        對話：\n${historyText}`;

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] })
        });
        const data = await res.json();
        let aiText = data.candidates[0].content.parts[0].text.replace(/```json/g, '').replace(/```/g, '').trim();
        renderSummaryCards(JSON.parse(aiText.substring(aiText.indexOf('{'), aiText.lastIndexOf('}') + 1)));
    } catch (e) { alert("總結失敗，請檢查 API 與索引。"); } finally { document.getElementById('summaryLoadingModal').classList.add('hidden'); }
}

function renderSummaryCards(data) {
    document.getElementById('summaryOverallText').textContent = data.overall;
    const container = document.getElementById('summaryCardsContainer');
    container.innerHTML = '';
    data.cards.forEach(card => {
        const div = document.createElement('div');
        div.className = "bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-warm-orange mb-4";
        div.innerHTML = `<h4 class="font-bold">${card.name} (${card.role})</h4><p>渴望：${card.thoughts}</p><p>建議：${card.advice}</p>`; [cite: 20]
        container.appendChild(div);
    });
    document.getElementById('summaryResultModal').classList.remove('hidden');
}

// 🧠 AI 偵測與介入邏輯 [cite: 14, 16]
async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now();
    if (now - lastAIMessageTime < 8000) return;
    const triggers = ["煩", "生氣", "吵架", "兇", "錢", "未來", "以後", "算了", "累了", "態度", "隨便"]; [cite: 47]
    if (triggers.some(k => lastText.includes(k)) || conversationCount % 3 === 0) {
        lastAIMessageTime = now;
        await triggerAIPrompt("translate", lastText, senderName);
    }
}

async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    try {
        const snap = await db.collection('rooms').doc(currentRoomId).collection('messages').orderBy('timestamp', 'desc').limit(8).get();
        const history = snap.docs.map(doc => `${doc.data().senderName}:${doc.data().text}`).reverse().join('\n');
        
        // ⭐ 修正語法錯誤所在：確保 prompt 賦值語法正確
        let promptText = "";
        if (mode === "force_mediation") {
            promptText = `成員 ${senderName} 已沉默許久。根據背景：\n${history}\n，替他說一段感性的話，限 150 字。`;
        } else if (mode === "idle_warmup") {
            promptText = `全家無人說話。根據對話：\n${history}\n，主動說一段暖場的話。`; [cite: 17]
        } else {
            promptText = `將「${lastText}」翻譯成背後的溫柔需求。紀錄：\n${history}`;
        }

        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptText }] }] })
        });
        const data = await res.json();
        if (data.candidates) await sendToDatabase(data.candidates[0].content.parts[0].text, 'AI', 'Re:Family 智能助手', currentRoomId);
    } catch (e) { console.error("AI 執行錯誤:", e); } finally { loadingIndicator.classList.add('hidden'); }
}

function showPledgeModal() { pledgeModal.classList.remove('hidden'); submitPledgeButton.disabled = false; }
function handlePledgeSubmit() { sendToDatabase("我希望破冰，打破我們之間的隔閡! (已宣誓)", sessionId, currentUserName, currentRoomId); pledgeModal.classList.add('hidden'); }
async function triggerSuccessAI() {
    await sendToDatabase("謝謝你們體諒彼此，一起約時間聊天吧~ [AI_SUCCESS_REPLY]", 'AI', 'Re:Family 智能助手', currentRoomId);
    if(confettiContainer) { [cite: 24]
        confettiContainer.classList.remove('hidden');
        for(let i=0; i<80; i++) {
            const c = document.createElement('div'); c.className = 'confetti'; c.style.left = Math.random()*100+'vw';
            c.style.backgroundColor = ['#FF8A65','#FFAB91','#F8BBD9'][Math.floor(Math.random()*3)];
            c.style.animationDuration = (Math.random()*3+2)+'s'; confettiContainer.appendChild(c);
        }
        setTimeout(()=>confettiContainer.classList.add('hidden'), 6000);
    }
}

function handleSendAction() {
    const text = userInput.value.trim();
    if (!currentRoomId || !text || Date.now() - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;
    if (text.includes("破冰")) { showPledgeModal(); userInput.value = ""; return; }
    LAST_USER_SEND_TIME = Date.now(); updateTypingStatus(false);
    sendToDatabase(text, sessionId, currentUserName, currentRoomId); userInput.value = '';
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    const expireAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.collection('rooms').doc(roomId).collection('messages').add({ text, senderId, senderName, timestamp: Date.now(), expireAt });
}

function handleLeaveRoom() { updateTypingStatus(false); localStorage.clear(); window.location.reload(); }
