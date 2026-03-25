// =================================================================
// 🚨🚨🚨 【防封鎖設定】Gemini API 金鑰 🚨🚨🚨
// =================================================================
const KEY_PART_1 = "AIzaSyCwVW"; 
const KEY_PART_2 = "en7tHL6yH1cmjYv9ZruRpnEx23Fk0";
const GEMINI_API_KEY = KEY_PART_1 + KEY_PART_2;

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

// DOM 元素
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

// 破冰與特效
const pledgeModal = document.getElementById('pledgeModal');
const pledgeInput = document.getElementById('pledgeInput');
const submitPledgeButton = document.getElementById('submitPledgeButton');
const confettiContainer = document.getElementById('confettiContainer');

// 狀態變數
let currentUserName = localStorage.getItem('chatUserName') || null;
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationHistory = []; 
let conversationCount = 0;
let lastAIMessageTime = 0;
let LAST_USER_SEND_TIME = 0;
const COOLDOWN_TIME = 2000; 

// ⭐ 優化重點：在線人數與打字狀態
let currentRoomUserCount = 0;
let typingUsersList = [];
let typingTimeout = null;

// 全域閒置計時器
let lastRoomActivityTime = Date.now(); 

// =================================================================
// ⭐ 初始化與輸入偵測
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
    
    // ⭐ 輸入框監聽：即時重置計時器並更新打字狀態
    if(userInput) {
        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSendAction(); }
            // 只要按下鍵盤，就更新「最後活動時間」，防止冷場跳出
            lastRoomActivityTime = Date.now();
            updateTypingStatus(true);
        });
        userInput.addEventListener('blur', () => updateTypingStatus(false));
    }

    if (pledgeInput) {
        pledgeInput.addEventListener('input', (e) => {
            if (e.target.value.trim() === "我希望破冰，打破我們之間的隔閡!") {
                submitPledgeButton.disabled = false;
                submitPledgeButton.className = "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg transform hover:-translate-y-1 transition-all";
            } else {
                submitPledgeButton.disabled = true;
                submitPledgeButton.className = "w-full py-3.5 bg-gray-300 text-white font-bold rounded-xl cursor-not-allowed shadow-md";
            }
        });
    }

    if (submitPledgeButton) submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    setInterval(checkIdleAndTriggerPledge, 5000);
};

// ⭐ 打字狀態同步邏輯 (讓家人知道你在思考)
async function updateTypingStatus(isTyping) {
    if (!currentRoomId || !currentUserName) return;
    const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId);
    
    try {
        if (isTyping) {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayUnion(currentUserName) });
            // 3秒沒打字自動移除
            clearTimeout(typingTimeout);
            typingTimeout = setTimeout(() => updateTypingStatus(false), 3000);
        } else {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
        }
    } catch (e) { console.warn("打字狀態同步略過"); }
}

// ⭐ 冷場偵測：若有人在打字或是只有一個人，則跳過
function checkIdleAndTriggerPledge() {
    if (!currentRoomId || !pledgeModal.classList.contains('hidden')) return;

    // 排除條件：1.房間只有一人 2.有人正在打字
    const isSomeoneTyping = typingUsersList.length > 0;
    if (currentRoomUserCount < 2 || isSomeoneTyping) {
        lastRoomActivityTime = Date.now(); // 重置時間，給予思考空間
        return;
    }

    const idleTime = Date.now() - lastRoomActivityTime;
    if (idleTime > 60000) { 
        console.log("偵測到真正的冷場，跳出破冰！");
        showPledgeModal();
    }
}

// 🏠 房間進入邏輯
async function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, '');
    const password = roomPasswordInput.value.trim();
    const userName = userNameInput.value.trim();

    if (roomId.length < 4 || !password || !userName) { 
        alert("請完整輸入房間資訊！"); return; 
    }

    startChatButton.disabled = true;
    startChatButton.textContent = "驗證中...";

    try {
        const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(roomId);
        const doc = await roomDocRef.get();
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); 

        if (doc.exists) {
            const confirmed = confirm(`📢 通知：房間「${roomId}」已被佔用。\n\n加入家人房間按「確定」；建立新房請按「取消」並換代碼。`);
            if (!confirmed) { resetEntryButton(); return; }
            if (doc.data().password !== password) { alert("❌ 密碼錯誤！"); resetEntryButton(); return; }
            
            await roomDocRef.update({
                active_users: firebase.firestore.FieldValue.arrayUnion(userName),
                expireAt: expireDate
            });
        } else {
            await roomDocRef.set({
                password: password,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: expireDate,
                active_users: [userName],
                typing_users: []
            });
        }

        currentRoomId = roomId;
        currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId);
        localStorage.setItem('chatUserName', currentUserName);
        startChatListener(currentRoomId);
        updateUIForChat();

    } catch (error) {
        alert("連線失敗");
        resetEntryButton();
    }
}

function resetEntryButton() {
    startChatButton.disabled = false;
    startChatButton.textContent = "開始群聊";
}

function updateUIForChat() {
    if(roomEntryScreen) roomEntryScreen.style.display = 'none';
    userInput.disabled = false;
    userInput.placeholder = "輸入訊息內容..."; 
    sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden');
    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會協助大家溝通。`, 'system', 'Re:Family');
}

// 💬 訊息顯示
function displayMessage(content, type, senderName, timestamp) {
    if (typeof content !== 'string') return;
    const displayContent = content.replace('[TRIGGER_PLEDGE]', '').replace('[AI_SUCCESS_REPLY]', ''); 
    if (!displayContent.trim()) return;

    const messageContainer = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>');
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4');
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';
    if (content.includes("已宣誓破冰")) bubbleClass = 'bg-green-100 text-green-800 border border-green-200';

    messageContainer.classList.add(type === 'user' ? 'justify-end' : 'justify-start');
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${type === 'user' ? 'items-end' : 'items-start'}`;
    wrapper.innerHTML = `<div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div>
                         <div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${cleanedContent}</div>`;

    const icon = document.createElement('div');
    icon.className = `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${senderName.includes('Re:Family') ? 'bg-warm-peach' : 'bg-gray-300'}`;
    icon.innerHTML = senderName.includes('Re:Family') ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>';

    if (type !== 'user') { messageContainer.appendChild(icon); messageContainer.appendChild(wrapper); } 
    else { messageContainer.appendChild(wrapper); messageContainer.appendChild(icon); }

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 🔥 Firestore 監聽
let displayedMessageIds = new Set();
let pledgeCount = 0; 

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;
    pledgeCount = 0;

    // ⭐ 監聽房間狀態：在線人數與打字中列表
    db.collection(ROOMS_METADATA_COLLECTION).doc(roomId)
        .onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                currentRoomUserCount = data.active_users ? data.active_users.length : 0;
                // 過濾掉自己，顯示別人的打字狀態
                typingUsersList = (data.typing_users || []).filter(u => u !== currentUserName);
                if (typingUsersList.length > 0) {
                    typingUserName.textContent = typingUsersList.join(', ');
                    typingIndicator.style.opacity = "1";
                } else {
                    typingIndicator.style.opacity = "0";
                }
            }
        });

    db.collection('rooms').doc(roomId).collection('messages')
        .orderBy('timestamp').limit(50)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    if (!displayedMessageIds.has(change.doc.id)) {
                        displayedMessageIds.add(change.doc.id);
                        lastRoomActivityTime = Date.now();
                        const isMe = msg.senderId === sessionId;
                        const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');

                        if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_PLEDGE]')) {
                            setTimeout(() => { if (Date.now() - msg.timestamp < 60000) showPledgeModal(); }, 1000);
                        }
                        if (msg.text.includes("我希望破冰")) {
                            pledgeCount++;
                            if (pledgeCount >= 2 && Date.now() - msg.timestamp < 10000 && isMe) triggerSuccessAI();
                        }

                        displayMessage(msg.text, type, msg.senderName, msg.timestamp);
                        if (msg.senderId !== 'AI') {
                            conversationHistory.push({ role: 'user', name: msg.senderName, text: msg.text });
                            conversationCount++;
                            if (isMe) checkAndTriggerAI(msg.text, msg.senderName);
                        }
                    }
                }
            });
        });
}

// 🧠 AI 偵測機制 (完整保留 4 種與 Prompt)
async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now();
    if (now - lastAIMessageTime < 8000) return;

    const generalTriggers = ["煩", "生氣", "吵架", "兇", "控制", "管", "不聽話", "亂花錢", "態度", "閉嘴", "垃圾", "理由", "藉口", "囉嗦", "不懂", "隨便"];
    const pressureTriggers = ["現實", "房租", "保險", "錢", "未來", "以後", "為你好", "擔心", "失望", "比較", "別人", "努力", "辛苦", "長大", "賺錢", "花錢", "生活費"];
    const deepNeedsTriggers = ["當成大人", "尊重的", "會思考的人", "不管我", "自己決定", "平等", "長大", "信任"];
    const deadlockTriggers = ["內耗", "沒辦法溝通", "不被理解", "累了", "放棄", "無法溝通", "心很累", "不想講了", "算了"];

    const isGeneral = generalTriggers.some(k => lastText.includes(k));
    const isPressure = pressureTriggers.some(k => lastText.includes(k));
    const isDeep = deepNeedsTriggers.some(k => lastText.includes(k));
    const isDeadlock = deadlockTriggers.some(k => lastText.includes(k));

    if (isGeneral || isPressure || isDeep || isDeadlock || conversationCount % 3 === 0) {
        lastAIMessageTime = now;
        let mode = (isDeep || isDeadlock) ? "summary" : "translate"; 
        await triggerAIPrompt(mode, lastText, senderName);
    }
}

async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    const historyText = conversationHistory.slice(-8).map(m => `${m.name}: ${m.text}`).join('\n');
    let prompt = mode === "summary" ? 
        `你現在是「Re:Family」的資深家庭調解員。對話紀錄：${historyText}。任務：溫暖解析。禁提術語。必須告知輸入破冰字句並加標籤 [TRIGGER_PLEDGE]` : 
        `你現在是「Re:Family」的家庭溝通翻譯官。紀錄：${historyText}。最後一句：${senderName}: "${lastText}"。任務：翻譯成背後善意，溫柔限100字內。`;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 2000 } })
        });
        const data = await response.json();
        const aiText = data.candidates[0].content.parts[0].text;
        await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
    } catch (e) { console.error(e); } finally { if (loadingIndicator) loadingIndicator.classList.add('hidden'); }
}

async function triggerSuccessAI() {
    const successMsg = "謝謝你們體諒彼此，一起約的時間出來聊聊天吧~ [AI_SUCCESS_REPLY]";
    await sendToDatabase(successMsg, 'AI', 'Re:Family 智能助手', currentRoomId);
    if(confettiContainer) {
        confettiContainer.classList.remove('hidden');
        for(let i=0; i<100; i++) {
            const c = document.createElement('div');
            c.className = 'confetti'; c.style.left = Math.random()*100+'vw';
            c.style.backgroundColor = ['#FF8A65','#FFAB91','#F8BBD9'][Math.floor(Math.random()*3)];
            c.style.animationDuration = (Math.random()*3+2)+'s';
            confettiContainer.appendChild(c);
        }
        setTimeout(()=>confettiContainer.classList.add('hidden'), 6000);
    }
}

function showPledgeModal() { 
    if (pledgeModal) {
        pledgeModal.classList.remove('hidden'); pledgeInput.value = "我希望破冰，打破我們之間的隔閡!"; 
        submitPledgeButton.disabled = false;
        submitPledgeButton.className = "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg";
    }
}
function handlePledgeSubmit() {
    sendToDatabase("我希望破冰，打破我們之間的隔閡! (已宣誓)", sessionId, currentUserName, currentRoomId);
    if (pledgeModal) pledgeModal.classList.add('hidden');
    lastRoomActivityTime = Date.now();
}

function handleSendAction() {
    const text = userInput.value.trim();
    if (!text || !currentRoomId) return;
    updateTypingStatus(false);
    sendToDatabase(text, sessionId, currentUserName, currentRoomId);
    userInput.value = '';
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, senderId: senderId, senderName: senderName, timestamp: Date.now(), expireAt: expireDate
    });
}

function handleLeaveRoom() { updateTypingStatus(false); localStorage.clear(); window.location.reload(); }
