// =================================================================
// 🚨🚨🚨 【最終搶救：穩定版本】Gemini API 金鑰 🚨🚨🚨
// =================================================================
const KEY_PART_1 = "AIzaSyCwVW"; 
const KEY_PART_2 = "en7tHL6yH1cmjYv9ZruRpnEx23Fk0";

// ⭐ 強力過濾器：清除所有隱形字元與中文字，避免 ISO-8859-1 報錯
const GEMINI_API_KEY = (KEY_PART_1 + KEY_PART_2).replace(/[^\x21-\x7E]/g, '').trim();

// Firebase 設定
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

let currentUserName = localStorage.getItem('chatUserName') || null;
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationHistory = []; 
let conversationCount = 0;
let lastAIMessageTime = 0;
let LAST_USER_SEND_TIME = 0;
const COOLDOWN_TIME = 2000; 
let currentRoomUserCount = 0;
let roomActiveUsersList = []; 
let typingUsersList = [];
let typingTimeout = null;
let lastRoomActivityTime = Date.now(); 
let isInitialLoad = true;

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
    if (submitPledgeButton) submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    setInterval(checkIdleAndTriggerPledge, 5000);
};

window.addEventListener('beforeunload', () => {
    if (currentRoomId && currentUserName) {
        db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId).update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
    }
});

async function updateTypingStatus(isTyping) {
    if (!currentRoomId || !currentUserName) return;
    const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId);
    try {
        if (isTyping) {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayUnion(currentUserName) });
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => updateTypingStatus(false), 3000);
        } else {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
        }
    } catch (e) {}
}

function checkIdleAndTriggerPledge() {
    if (!currentRoomId || !pledgeModal.classList.contains('hidden')) return;
    if (currentRoomUserCount < 2) { lastRoomActivityTime = Date.now(); return; }
    const idleTime = Date.now() - lastRoomActivityTime;
    if (typingUsersList.length > 0 && idleTime < 90000) return;
    if (idleTime > 60000) { 
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            triggerAIPrompt("summary", lastMsg.text, lastMsg.name);
        } else { showPledgeModal(); }
        lastRoomActivityTime = Date.now(); 
    }
}

async function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, '');
    const password = roomPasswordInput.value.trim();
    const userName = userNameInput.value.trim();
    if (roomId.length < 4 || !password || !userName) { alert("請完整輸入房間資訊！"); return; }
    startChatButton.disabled = true; startChatButton.textContent = "驗證中...";
    try {
        const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(roomId);
        const doc = await roomDocRef.get();
        if (doc.exists) {
            if (doc.data().password === password) {
                if (doc.data().active_users && doc.data().active_users.includes(userName)) {
                    if (!confirm(`暱稱 "${userName}" 已存在。確定要使用嗎？`)) { resetEntryButton(); return; }
                }
                await roomDocRef.update({ active_users: firebase.firestore.FieldValue.arrayUnion(userName), expireAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000) });
            } else { alert("❌ 密碼錯誤！"); resetEntryButton(); return; }
        } else {
            await roomDocRef.set({ password: password, created_at: firebase.firestore.FieldValue.serverTimestamp(), expireAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000), active_users: [userName], typing_users: [] });
        }
        currentRoomId = roomId; currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId); localStorage.setItem('chatUserName', currentUserName);
        startChatListener(currentRoomId); updateUIForChat();
    } catch (error) { alert("連線失敗"); resetEntryButton(); }
}

function resetEntryButton() { startChatButton.disabled = false; startChatButton.textContent = "開始群聊"; }

function updateUIForChat() {
    if(roomEntryScreen) roomEntryScreen.style.display = 'none';
    userInput.disabled = false; userInput.placeholder = "輸入訊息內容..."; sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden');
    const sumBtn = document.getElementById('generateSummaryBtn');
    if(sumBtn) sumBtn.classList.remove('hidden');
    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴，協助大家溝通。`, 'system', 'Re:Family');
    lastRoomActivityTime = Date.now();
}

function displayMessage(content, type, senderName, timestamp) {
    if (typeof content !== 'string' || !content.trim()) return;
    const displayContent = content.replace('[TRIGGER_PLEDGE]', '').replace('[AI_SUCCESS_REPLY]', ''); 
    const messageContainer = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>');
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4', type === 'user' ? 'justify-end' : 'justify-start');
    
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';
    
    if (content.includes("已宣誓破冰")) bubbleClass = 'bg-green-100 text-green-800 border border-green-200';
    if (content.includes("系統提示")) bubbleClass = 'bg-red-50 text-red-700 border border-red-200';

    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${type === 'user' ? 'items-end' : 'items-start'}`;
    wrapper.innerHTML = `<div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div><div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${cleanedContent}</div>`;
    
    const icon = document.createElement('div');
    icon.className = `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${senderName.includes('Re:Family') ? 'bg-warm-peach' : 'bg-gray-300'}`;
    icon.innerHTML = senderName.includes('Re:Family') ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>';
    
    if (type !== 'user') { messageContainer.appendChild(icon); messageContainer.appendChild(wrapper); } 
    else { messageContainer.appendChild(wrapper); messageContainer.appendChild(icon); }
    chatArea.appendChild(messageContainer); chatArea.scrollTop = chatArea.scrollHeight;
}

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = ''; displayedMessageIds = new Set(); conversationHistory = []; conversationCount = 0; pledgeCount = 0; isInitialLoad = true;
    db.collection(ROOMS_METADATA_COLLECTION).doc(roomId).onSnapshot(doc => {
        if (doc.exists) {
            const data = doc.data(); roomActiveUsersList = data.active_users || []; currentRoomUserCount = roomActiveUsersList.length;
            typingUsersList = (data.typing_users || []).filter(u => u !== currentUserName);
            if (typingUsersList.length > 0) {
                typingUserName.textContent = typingUsersList.join(', '); typingIndicator.style.opacity = "1";
            } else { typingIndicator.style.opacity = "0"; }
        }
    });
    db.collection('rooms').doc(roomId).collection('messages').orderBy('timestamp').limit(50).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (!displayedMessageIds.has(change.doc.id)) {
                    displayedMessageIds.add(change.doc.id);
                    const isBrandNew = !isInitialLoad;
                    if (isBrandNew) lastRoomActivityTime = Date.now();
                    const type = msg.senderId === 'AI' ? 'system' : (msg.senderId === sessionId ? 'user' : 'other');
                    if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_PLEDGE]')) setTimeout(() => showPledgeModal(), 1000);
                    if (msg.text.includes("我希望破冰") && msg.text.includes("已宣誓")) {
                        pledgeCount++; if (pledgeCount >= 2 && msg.senderId === sessionId) triggerSuccessAI();
                    }
                    displayMessage(msg.text, type, msg.senderName, msg.timestamp);
                    if (msg.senderId !== 'AI') {
                        conversationHistory.push({ role: 'user', name: msg.senderName, text: msg.text });
                        if (isBrandNew && msg.senderId === sessionId) {
                            conversationCount++;
                            checkAndTriggerAI(msg.text, msg.senderName);
                        }
                    }
                }
            }
        });
        isInitialLoad = false;
    });
}

async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now(); if (now - lastAIMessageTime < 8000) return;
    const triggers = ["煩", "生氣", "吵架", "兇", "控制", "管", "不聽話", "亂花錢", "錢", "未來", "尊重", "算了", "累了", "垃圾"];
    if (triggers.some(k => lastText.includes(k)) || conversationCount % 3 === 0) {
        lastAIMessageTime = now;
        let mode = (lastText.includes("算了") || lastText.includes("累了")) ? "summary" : "translate";
        await triggerAIPrompt(mode, lastText, senderName);
    }
}

async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    const hist = conversationHistory.slice(-8).map(m => `${m.name}: ${m.text}`).join('\n');
    let prompt = mode === "summary" ? `你現在是資深家庭調解員。請總結衝突並建議輸入破冰句並加標籤 [TRIGGER_PLEDGE]：\n${hist}` : `你現在是溝通翻譯官。上下文：\n${hist}\n將這句翻譯成「背後的善意需求」：${senderName}: "${lastText}"`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7 } })
        });
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        await sendToDatabase(data.candidates[0].content.parts[0].text, 'AI', 'Re:Family 智能助手', currentRoomId);
    } catch (e) { displayMessage(`[系統提示] AI 連線失敗: ${e.message}`, 'system', 'Re:Family'); }
    finally { if (loadingIndicator) loadingIndicator.classList.add('hidden'); }
}

async function generateSummaryReport() {
    if (conversationHistory.length < 2) { alert("目前的對話還太少！"); return; }
    document.getElementById('summaryLoadingModal').classList.remove('hidden');
    const hist = conversationHistory.slice(-40).map(m => `${m.name}: ${m.text}`).join('\n');
    const users = roomActiveUsersList.length > 0 ? roomActiveUsersList.join('、') : "成員";
    const prompt = `你現在是心理諮商師。根據對話：\n${hist}\n針對成員(${users})產生 JSON 總結：{"overall":"...","cards":[{"name":"...","role":"...","thoughts":"...","advice":"..."}]}`;
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, responseMimeType: "application/json" } })
        });
        const data = await response.json();
        renderSummaryCards(JSON.parse(data.candidates[0].content.parts[0].text));
    } catch (e) { alert("總結失敗，請稍後再試！"); }
    finally { document.getElementById('summaryLoadingModal').classList.add('hidden'); }
}

function renderSummaryCards(data) {
    document.getElementById('summaryOverallText').textContent = data.overall;
    const container = document.getElementById('summaryCardsContainer');
    container.innerHTML = '';
    data.cards.forEach(card => {
        const div = document.createElement('div');
        div.className = "bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-warm-orange mb-4";
        div.innerHTML = `<h4 class="font-bold">${card.name} (${card.role})</h4><p class="text-sm mt-2"><strong>渴望：</strong>${card.thoughts}</p><p class="text-sm mt-1"><strong>建議：</strong>${card.advice}</p>`;
        container.appendChild(div);
    });
    document.getElementById('summaryResultModal').classList.remove('hidden');
}

async function triggerSuccessAI() {
    await sendToDatabase("謝謝你們體諒彼此，一起約個時間出來聊聊天吧~ [AI_SUCCESS_REPLY]", 'AI', 'Re:Family 智能助手', currentRoomId);
    confettiContainer.classList.remove('hidden');
    for(let i=0; i<80; i++) {
        const c = document.createElement('div'); c.className = 'confetti'; c.style.left = Math.random()*100+'vw';
        c.style.backgroundColor = ['#FF8A65','#FFAB91','#F8BBD9'][Math.floor(Math.random()*3)];
        c.style.animationDuration = (Math.random()*3+2)+'s'; confettiContainer.appendChild(c);
    }
    setTimeout(() => confettiContainer.classList.add('hidden'), 5000);
}

function showPledgeModal() { pledgeModal.classList.remove('hidden'); pledgeInput.value = "我希望破冰，打破我們之間的隔閡!"; }
function handlePledgeSubmit() {
    sendToDatabase("我希望破冰，打破我們之間的隔閡! (已宣誓)", sessionId, currentUserName, currentRoomId);
    pledgeModal.classList.add('hidden'); lastRoomActivityTime = Date.now();
}
function handleSendAction() {
    const text = userInput.value.trim();
    if (!currentRoomId || !text) return;
    if (text.includes("破冰")) { showPledgeModal(); userInput.value = ""; return; }
    if (Date.now() - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;
    LAST_USER_SEND_TIME = Date.now(); updateTypingStatus(false);
    sendToDatabase(text, sessionId, currentUserName, currentRoomId); userInput.value = '';
}
async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, senderId: senderId, senderName: senderName, timestamp: Date.now(), expireAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    });
}
function handleLeaveRoom() { updateTypingStatus(false); localStorage.clear(); window.location.reload(); }
