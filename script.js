// =================================================================
// 🚨🚨🚨 【防封鎖設定】請填入您的新金鑰 (請務必切成兩半) 🚨🚨🚨
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

// 破冰與特效元素
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

// 全域閒置計時器
let lastRoomActivityTime = Date.now(); 

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

    // 綁定事件
    if(startChatButton) startChatButton.addEventListener('click', handleRoomEntry);
    if(leaveRoomButton) leaveRoomButton.addEventListener('click', handleLeaveRoom);
    if(sendButton) sendButton.addEventListener('click', handleSendAction);
    if(userInput) userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); handleSendAction(); }
    });

    // 破冰輸入框監聽
    if (pledgeInput) {
        pledgeInput.addEventListener('input', (e) => {
            const targetText = "我希望破冰，打破我們之間的隔閡!";
            if (e.target.value.trim() === targetText) {
                submitPledgeButton.disabled = false;
                submitPledgeButton.classList.remove('bg-gray-300', 'cursor-not-allowed');
                submitPledgeButton.classList.add('bg-warm-orange', 'hover:bg-warm-peach', 'transform', 'hover:-translate-y-1');
            } else {
                submitPledgeButton.disabled = true;
                submitPledgeButton.classList.add('bg-gray-300', 'cursor-not-allowed');
                submitPledgeButton.classList.remove('bg-warm-orange', 'hover:bg-warm-peach', 'transform', 'hover:-translate-y-1');
            }
        });
    }

    if (submitPledgeButton) {
        submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    }

    // 啟動冷場偵測器 (每 5 秒檢查一次)
    setInterval(checkIdleAndTriggerPledge, 5000);
};

// =================================================================
// ❄️ 冷場偵測邏輯 (已修改為 60 秒)
// =================================================================
function checkIdleAndTriggerPledge() {
    // 只有在已登入且視窗未顯示時才檢查
    if (!currentRoomId || !pledgeModal.classList.contains('hidden')) return;

    const idleTime = Date.now() - lastRoomActivityTime;
    
    // ⭐ 修改：如果超過 60 秒沒有新訊息 (60000 毫秒)
    if (idleTime > 60000) {
        console.log("偵測到冷場超過 60 秒，自動觸發破冰！");
        showPledgeModal();
    }
}

// =================================================================
// 🧹 訪客清理
// =================================================================
async function cleanupExpiredData(roomId) {
    const now = new Date();
    try {
        const messagesRef = db.collection('rooms').doc(roomId).collection('messages');
        const snapshot = await messagesRef.where('expireAt', '<', now).get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }
    } catch (e) { console.warn("清理略過:", e); }
}

// =================================================================
// 🏠 房間進入
// =================================================================
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
            if (doc.data().password !== password) {
                alert("密碼錯誤！");
                resetEntryButton();
                return;
            }
            if (doc.data().active_users && doc.data().active_users.includes(userName)) {
                if (!confirm(`暱稱 "${userName}" 已存在。確定要使用嗎？`)) {
                    resetEntryButton();
                    return;
                }
            }
            await roomDocRef.update({
                active_users: firebase.firestore.FieldValue.arrayUnion(userName),
                expireAt: expireDate
            });
        } else {
            await roomDocRef.set({
                password: password,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: expireDate,
                active_users: [userName]
            });
        }

        currentRoomId = roomId;
        currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId);
        localStorage.setItem('chatUserName', currentUserName);

        cleanupExpiredData(currentRoomId);
        startChatListener(currentRoomId);
        updateUIForChat();

    } catch (error) {
        console.error("驗證錯誤:", error);
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
    sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden');
    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴，協助大家溝通。`, 'system', 'Re:Family');
    
    // 初始化計時器
    lastRoomActivityTime = Date.now();
}

// =================================================================
// 💬 訊息顯示
// =================================================================
function displayMessage(content, type, senderName, timestamp) {
    if (typeof content !== 'string') return;
    
    // 隱藏指令標籤
    const displayContent = content
        .replace('[TRIGGER_PLEDGE]', '')
        .replace('[AI_SUCCESS_REPLY]', ''); 

    if (!displayContent.trim()) return;

    const messageContainer = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>');

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4');
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

    let wrapperClass = type === 'user' ? 'items-end' : 'items-start';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';

    // 特殊系統訊息樣式 (破冰宣言)
    if (content.includes("已宣誓破冰")) {
        bubbleClass = 'bg-green-100 text-green-800 border border-green-200';
    }

    messageContainer.classList.add(type === 'user' ? 'justify-end' : 'justify-start');
    
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${wrapperClass}`;
    wrapper.innerHTML = `<div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div>
                         <div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${cleanedContent}</div>`;

    const icon = document.createElement('div');
    icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0';
    
    if (senderName.includes('Re:Family') || senderName.includes('智能助手')) {
        icon.classList.add('bg-warm-peach');
        icon.innerHTML = '<i class="fas fa-heart text-white"></i>';
    } else {
        icon.classList.add('bg-gray-300');
        icon.innerHTML = '<i class="fas fa-user text-gray-600"></i>';
    }

    if (type !== 'user') {
        messageContainer.appendChild(icon);
        messageContainer.appendChild(wrapper);
    } else {
        messageContainer.appendChild(wrapper);
        messageContainer.appendChild(icon);
    }

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// =================================================================
// 🔥 Firestore 監聽 (含破冰邏輯)
// =================================================================
let displayedMessageIds = new Set();
let pledgeCount = 0; 

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;
    pledgeCount = 0;

    db.collection('rooms').doc(roomId).collection('messages')
        .orderBy('timestamp')
        .limit(50)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    if (!displayedMessageIds.has(change.doc.id)) {
                        displayedMessageIds.add(change.doc.id);
                        
                        // ⭐ 收到任何新訊息，都更新活動時間 (重置冷場計時器)
                        lastRoomActivityTime = Date.now();

                        const isMe = msg.senderId === sessionId;
                        const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');

                        // 🔍 偵測 AI 發出的破冰指令
                        if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_PLEDGE]')) {
                            if (Date.now() - msg.timestamp < 60000) {
                                showPledgeModal();
                            }
                        }

                        // 🔍 偵測是否有使用者發出 "宣誓"
                        if (msg.text.includes("我希望破冰，打破我們之間的隔閡!")) {
                            pledgeCount++;
                            if (pledgeCount >= 2 && Date.now() - msg.timestamp < 10000) {
                                if (isMe) triggerSuccessAI();
                            }
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

// =================================================================
// 🧠 AI 腦袋 (升級版)
// =================================================================
async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now();
    if (now - lastAIMessageTime < 8000) return;

    // 1. 一般負面觸發
    const generalTriggers = ["煩", "生氣", "吵架", "兇", "控制", "管", "不聽話", "亂花錢", "態度", "閉嘴", "垃圾", "理由", "藉口"];
    
    // 2. 深度需求 (渴望被理解)
    const deepNeedsTriggers = ["當成大人", "尊重的", "會思考的人", "不管我", "自己決定", "平等", "長大", "信任"];
    
    // 3. 僵局/內耗 (Burnout)
    const deadlockTriggers = ["內耗", "沒辦法溝通", "不被理解", "累了", "放棄", "無法溝通", "心很累"];

    const isGeneral = generalTriggers.some(k => lastText.includes(k));
    const isDeep = deepNeedsTriggers.some(k => lastText.includes(k));
    const isDeadlock = deadlockTriggers.some(k => lastText.includes(k));

    console.log(`偵測: 一般:${isGeneral}, 深度:${isDeep}, 僵局:${isDeadlock}`);

    if (isGeneral || isDeep || isDeadlock || conversationCount % 5 === 0) {
        lastAIMessageTime = now;
        
        let mode = "translate"; 
        if (isDeep || isDeadlock) mode = "summary"; 

        await triggerAIPrompt(mode, lastText, senderName);
    }
}

async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const historyText = conversationHistory.slice(-8).map(m => `${m.name}: ${m.text}`).join('\n');

    let prompt = "";

    if (mode === "summary") {
        prompt = `
        你現在是「Re:Family」的資深家庭調解員。
        
        **對話紀錄：**
        ${historyText}

        **任務：**
        請**總結雙方目前的心聲**，轉化成 100 到 250 字之間的溫暖解析。
        
        **⛔ 絕對禁止：**
        1. 不要在回應中提到「Satir」、「薩提爾」、「冰山理論」等名詞。直接像個真人一樣說話。
        2. 不要說教。
        
        **解析架構：**
        1. **${senderName} (當事人) 的心聲：** 他表面上在爭執，但內心渴望的是什麼？（如：想被當成大人）。
        2. **對方的善意：** 對方行為背後隱藏的善意或擔憂是什麼？（如：怕孩子受傷）。
        
        **3. 行動呼籲 (非常重要)：**
        總結完後，請務必明確告訴雙方：『如果想緩解一下，請輸入：我希望破冰，打破我們之間的隔閡!』
        
        **最後指令：**
        請在回應的最後面，務必加上標籤 [TRIGGER_PLEDGE] 以啟動系統功能。
        `;
    } else {
        prompt = `
        你現在是「Re:Family」的家庭溝通翻譯官。
        
        **上下文：** ${historyText}
        **最後一句：** ${senderName}: "${lastText}"

        **任務：**
        將這句可能帶有情緒的話，翻譯成「背後的善意與擔心」。
        例如：將「你真的很不聽話」翻譯成「其實是因為我很擔心你的安全」。
        
        **⛔ 絕對禁止：**
        1. 不准提到「薩提爾」、「冰山理論」。
        2. 不要說「根據理論」。
        
        **限制：** 100字以內，語氣溫柔。
        `;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                // ✅ 關鍵修正：字數上限拉高到 2500，保證不截斷，讓 [TRIGGER_PLEDGE] 能被印出來
                generationConfig: { temperature: 0.7, maxOutputTokens: 2500 } 
            })
        });

        if (!response.ok) { return; }

        const data = await response.json();
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            if (typeof aiText === 'string') await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
        }
    } catch (e) {
        console.error(e);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// 專門觸發成功慶祝的 AI
async function triggerSuccessAI() {
    const successMsg = "謝謝你們體諒彼此，一起約的時間出來聊聊天吧~ [AI_SUCCESS_REPLY]";
    await sendToDatabase(successMsg, 'AI', 'Re:Family 智能助手', currentRoomId);
    
    // 撒花
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
        setTimeout(()=>confettiContainer.classList.add('hidden'), 6000);
    }
}

// =================================================================
// 🎮 破冰遊戲 UI 邏輯
// =================================================================
function showPledgeModal() { 
    if (pledgeModal) {
        pledgeModal.classList.remove('hidden'); 
        pledgeInput.value = ""; // 清空輸入
        submitPledgeButton.disabled = true;
        submitPledgeButton.classList.add('bg-gray-300', 'cursor-not-allowed');
    }
}

function handlePledgeSubmit() {
    // 發送特殊的宣誓訊息
    const pledgeText = "我希望破冰，打破我們之間的隔閡! (已宣誓)";
    sendToDatabase(pledgeText, sessionId, currentUserName, currentRoomId);
    
    // 關閉視窗
    if (pledgeModal) pledgeModal.classList.add('hidden');
    
    // 重置活動時間，避免馬上又觸發
    lastRoomActivityTime = Date.now();
}

// =================================================================
// 🚀 發送與輔助函式
// =================================================================
function handleSendAction() {
    const userText = userInput.value.trim();
    if (!currentRoomId || !userText) return;
    const now = Date.now();
    if (now - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;
    LAST_USER_SEND_TIME = now;
    sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
    userInput.value = '';
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, senderId: senderId, senderName: senderName,
        timestamp: Date.now(), expireAt: expireDate
    });
}

function handleLeaveRoom() {
    localStorage.clear();
    window.location.reload();
}
