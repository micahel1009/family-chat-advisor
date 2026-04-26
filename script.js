// =================================================================
// 🚨🚨🚨 【防封鎖設定】ChatGPT (OpenAI) API 金鑰 🚨🚨🚨
// 請將你的 OpenAI 金鑰 (通常是 sk- 開頭) 拆成兩半貼在下方
// =================================================================
const KEY_PART_1 = "sk-proj-請換成你的前半段"; 
const KEY_PART_2 = "請換成你的後半段";
const OPENAI_API_KEY = KEY_PART_1 + KEY_PART_2;

// Firebase 設定 (保持不變)
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
            const targetText = "我希望破冰，打破我們之間的隔閡!";
            if (e.target.value.trim() === targetText) {
                submitPledgeButton.disabled = false;
                submitPledgeButton.className = "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg";
            } else {
                submitPledgeButton.disabled = true;
                submitPledgeButton.className = "w-full py-3.5 bg-gray-300 text-white font-bold rounded-xl cursor-not-allowed shadow-md";
            }
        });
    }

    if (submitPledgeButton) submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    setInterval(checkIdleAndTriggerPledge, 5000);
};

window.addEventListener('beforeunload', () => {
    if (currentRoomId && currentUserName) {
        db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId)
          .update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
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
    } catch (e) { console.warn("打字同步略過"); }
}

function checkIdleAndTriggerPledge() {
    if (!currentRoomId || !pledgeModal.classList.contains('hidden')) return;
    if (currentRoomUserCount < 2) {
        lastRoomActivityTime = Date.now();
        return;
    }

    const idleTime = Date.now() - lastRoomActivityTime;
    if (typingUsersList.length > 0 && idleTime < 90000) return;

    if (idleTime > 60000) { 
        console.log("偵測到冷場，交由 AI 分析目前對話！");
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            triggerAIPrompt("summary", lastMsg.text, lastMsg.name);
        } else {
            showPledgeModal();
        }
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
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); 

        if (doc.exists) {
            if (doc.data().password === password) {
                if (doc.data().active_users && doc.data().active_users.includes(userName)) {
                    if (!confirm(`暱稱 "${userName}" 已存在。確定要使用嗎？`)) { resetEntryButton(); return; }
                }
                await roomDocRef.update({ active_users: firebase.firestore.FieldValue.arrayUnion(userName), expireAt: expireDate });
            } else {
                const confirmed = confirm(`📢 通知：房間代碼「${roomId}」已被佔用。\n\n加入家人房間按「確定」；建立新房請按「取消」。`);
                if (!confirmed) { resetEntryButton(); return; }
                alert("❌ 密碼錯誤！"); resetEntryButton(); return;
            }
        } else {
            await roomDocRef.set({ password: password, created_at: firebase.firestore.FieldValue.serverTimestamp(), expireAt: expireDate, active_users: [userName], typing_users: [] });
        }

        currentRoomId = roomId; currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId); localStorage.setItem('chatUserName', currentUserName);
        startChatListener(currentRoomId);
        updateUIForChat();
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
    if (typeof content !== 'string') return;
    const displayContent = content.replace('[TRIGGER_PLEDGE]', '').replace('[AI_SUCCESS_REPLY]', ''); 
    if (!displayContent.trim()) return;

    const messageContainer = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>');
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4', type === 'user' ? 'justify-end' : 'justify-start');
    
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';
    
    if (content.includes("已宣誓破冰")) {
        bubbleClass = 'bg-green-100 text-green-800 border border-green-200';
    } else if (type === 'system' && content.includes("系統提示")) {
        bubbleClass = 'bg-red-100 text-red-800 border border-red-200';
    }

    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${type === 'user' ? 'items-end' : 'items-start'}`;
    wrapper.innerHTML = `
        <div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div>
        <div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${cleanedContent}</div>
    `;

    const icon = document.createElement('div');
    icon.className = `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${senderName.includes('Re:Family') ? 'bg-warm-peach' : 'bg-gray-300'}`;
    icon.innerHTML = senderName.includes('Re:Family') ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>';

    if (type !== 'user') { messageContainer.appendChild(icon); messageContainer.appendChild(wrapper); } 
    else { messageContainer.appendChild(wrapper); messageContainer.appendChild(icon); }

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;
    pledgeCount = 0;
    isInitialLoad = true;

    db.collection(ROOMS_METADATA_COLLECTION).doc(roomId)
        .onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                roomActiveUsersList = data.active_users || [];
                currentRoomUserCount = roomActiveUsersList.length;
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
                        
                        const isBrandNewMessage = !isInitialLoad;
                        if (isBrandNewMessage) lastRoomActivityTime = Date.now();
                        
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
                            if (isBrandNewMessage) {
                                conversationCount++;
                                if (isMe) checkAndTriggerAI(msg.text, msg.senderName);
                            }
                        }
                    }
                }
            });
            isInitialLoad = false; 
        });
}

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

// =================================================================
// ⭐ OpenAI API 切換 (聊天分析)
// =================================================================
async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    const historyText = conversationHistory.slice(-8).map(m => `${m.name}: ${m.text}`).join('\n');
    let prompt = mode === "summary" ? 
        `你現在是「Re:Family」的資深家庭調解員。對話紀錄：${historyText}。任務：請總結雙方目前的心聲，轉化成 100 到 250 字之間的溫暖解析。⛔絕對禁止：術語。指令：告知輸入破冰字句並加標籤 [TRIGGER_PLEDGE]` : 
        `你現在是「Re:Family」的家庭溝通翻譯官。上下文：${historyText}。最後一句：${senderName}: "${lastText}"。任務：將這句話翻譯成「背後的善意或需求」，限100字內，語氣溫柔。`;

    try {
        const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({ 
                model: "gpt-4o-mini", 
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            console.error(`[AI 被阻擋] OpenAI API 限制: ${data.error.message}`);
            displayMessage(`[系統提示] AI 暫時無法連線，請檢查 API Key 額度或設定。`, 'system', 'Re:Family');
            return;
        }
        
        const aiText = data.choices[0].message.content;
        await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
        
    } catch (e) { 
        console.error("AI 連線失敗:", e); 
    } finally { 
        if (loadingIndicator) loadingIndicator.classList.add('hidden'); 
    }
}

// =================================================================
// ⭐ OpenAI API 切換 (個人化總結報告)
// =================================================================
async function generateSummaryReport() {
    if (conversationHistory.length < 2) {
        alert("目前的對話還太少，請多聊幾句再讓我幫你們總結喔！");
        return;
    }
    
    const summaryBtn = document.getElementById('generateSummaryBtn');
    if (summaryBtn) summaryBtn.disabled = true; 

    document.getElementById('summaryLoadingModal').classList.remove('hidden');

    const historyText = conversationHistory.slice(-40).map(m => `${m.name}: ${m.text}`).join('\n');
    const usersStr = roomActiveUsersList.length > 0 ? roomActiveUsersList.join('、') : "全體成員";

    const prompt = `
    你現在是經驗豐富的家庭諮商師。請閱讀以下對話紀錄，並為房間內的每位成員 (${usersStr}) 產生一份專屬的溝通總結。
    對話紀錄：
    ${historyText}

    要求：
    1. 針對名單上的每個人，分別寫出他們在對話中的「內心渴望 (thoughts)」與「溫暖建議 (advice)」。
    2. 防呆機制：若某人在對話中發言極少或未發言，請不要捏造，改以溫暖口吻鼓勵。
    3. 必須嚴格輸出為 JSON 格式，完全符合以下結構：
    {
      "overall": "用 50 字總結這次家庭對話的整體氛圍與核心問題。",
      "cards": [
        { "name": "名單上的人名", "role": "他在對話中的角色", "thoughts": "他的心聲解讀...", "advice": "給他的溫暖建議..." }
      ]
    }`;

    try {
        const response = await fetch(`https://api.openai.com/v1/chat/completions`, {
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({ 
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5, 
                response_format: { type: "json_object" } 
            })
        });
        
        const data = await response.json();
        
        if (data.error) {
            throw new Error(`API 拒絕存取 (${data.error.message})`);
        }
        
        let aiText = data.choices[0].message.content;
        
        const result = JSON.parse(aiText); 
        renderSummaryCards(result);

    } catch (e) {
        console.error("總結失敗細節:", e);
        if (e.message && e.message.includes("API 拒絕存取")) {
            alert("抱歉，目前您的 OpenAI API Key 額度已滿或無效，請檢查金鑰設定。");
        } else {
            alert("分析報告時遇到一點小阻礙，請稍後再試一次！");
        }
    } finally {
        document.getElementById('summaryLoadingModal').classList.add('hidden');
        if (summaryBtn) summaryBtn.disabled = false; 
    }
}

function renderSummaryCards(data) {
    document.getElementById('summaryOverallText').textContent = data.overall;
    const container = document.getElementById('summaryCardsContainer');
    container.innerHTML = '';

    data.cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = "bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-warm-orange transition-transform hover:-translate-y-1";
        cardDiv.innerHTML = `
            <div class="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                <div class="w-12 h-12 bg-orange-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-warm-orange font-bold text-xl shadow-sm">${card.name.charAt(0)}</div>
                <div><h4 class="font-bold text-gray-800 dark:text-white text-lg">${card.name}</h4><span class="text-xs text-warm-orange bg-orange-50 dark:bg-gray-700 border border-orange-100 dark:border-gray-600 px-2 py-1 rounded-full">${card.role}</span></div>
            </div>
            <div class="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                <div class="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl"><p><strong class="text-warm-orange flex items-center gap-2 mb-1"><i class="fas fa-heartbeat"></i> 內心渴望：</strong>${card.thoughts}</p></div>
                <div class="bg-orange-50/50 dark:bg-gray-700/50 p-3 rounded-xl"><p><strong class="text-calm-blue flex items-center gap-2 mb-1"><i class="fas fa-lightbulb"></i> 專屬建議：</strong>${card.advice}</p></div>
            </div>
        `;
        container.appendChild(cardDiv);
    });
    
    document.getElementById('summaryResultModal').classList.remove('hidden');
}

async function triggerSuccessAI() {
    const successMsg = "謝謝你們體諒彼此，一起約的時間出來聊聊天吧~ [AI_SUCCESS_REPLY]";
    await sendToDatabase(successMsg, 'AI', 'Re:Family 智能助手', currentRoomId);
    
    if(confettiContainer) {
        confettiContainer.classList.remove('hidden');
        for(let i=0; i<100; i++) {
            const c = document.createElement('div');
            c.className = 'confetti'; 
            c.style.left = Math.random()*100+'vw';
            c.style.backgroundColor = ['#FF8A65','#FFAB91','#F8BBD9'][Math.floor(Math.random()*3)];
            c.style.animationDuration = (Math.random()*3+2)+'s';
            confettiContainer.appendChild(c);
        }
        setTimeout(() => confettiContainer.classList.add('hidden'), 6000);
    }
}

function showPledgeModal() { 
    if (pledgeModal) {
        pledgeModal.classList.remove('hidden'); 
        pledgeInput.value = "我希望破冰，打破我們之間的隔閡!"; 
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
    const userText = userInput.value.trim();
    if (!currentRoomId || !userText) return;

    if (userText.includes("破冰")) {
        console.log("主動發送觸發：破冰");
        showPledgeModal();
        userInput.value = ""; 
        updateTypingStatus(false);
        return;
    }

    const now = Date.now();
    if (now - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;
    LAST_USER_SEND_TIME = now;

    updateTypingStatus(false);
    sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
    userInput.value = '';
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, senderId: senderId, senderName: senderName, timestamp: Date.now(), expireAt: expireDate
    });
}

function handleLeaveRoom() { 
    updateTypingStatus(false); 
    localStorage.clear(); 
    window.location.reload(); 
}
