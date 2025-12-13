// 🚨 1. 請務必替換成您在 Google AI Studio 取得的 Gemini API 金鑰
const GEMINI_API_KEY = "AIzaSyAmCXDOyy2Ee-3R13JBZQPYg_pQpJjZASc"; 

// 🚨 2. Firebase 配置 (已根據您提供的資料填寫)
const firebaseConfig = {
    apiKey: "AIzaSyA6C0ArowfDaxJKV15anQZSZT7bcdeXJ2E",
    authDomain: "familychatadvisor.firebaseapp.com",
    projectId: "familychatadvisor",
    storageBucket: "familychatadvisor.firebasestorage.app",
    messagingSenderId: "172272099421",
    appId: "1:172272099421:web:a67b69291419194189edb4",
    measurementId: "G-SRY5B3JV85"
};

// 初始化 Firebase
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

// 🧊 C階段新增：破冰遊戲 UI 元素
const icebreakerOverlay = document.getElementById('icebreakerOverlay');
const confirmHugButton = document.getElementById('confirmHugButton');
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
const COOLDOWN_TIME = 10000; 

// --- 功能：訪客自動清理 (免信用卡方案) ---
async function cleanupExpiredData(roomId) {
    console.log("正在檢查過期資料...");
    const now = new Date();
    try {
        const messagesRef = db.collection('rooms').doc(roomId).collection('messages');
        const snapshot = await messagesRef.where('expireAt', '<', now).get();
        if (!snapshot.empty) {
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
            console.log(`已清理 ${snapshot.size} 則過期訊息`);
        }
    } catch (error) {
        console.warn("清理過期資料略過 (可能是無權限或無資料):", error);
    }
}

// --- 1. 房間進入邏輯 ---

async function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, ''); 
    const password = roomPasswordInput.value.trim();
    const userName = userNameInput.value.trim();

    if (roomId.length < 4) { alert("房間代碼至少 4 碼！"); return; }
    if (!password) { alert("請輸入密碼！"); return; }
    if (!userName) { alert("請輸入暱稱！"); return; }

    startChatButton.disabled = true;
    startChatButton.textContent = "驗證中...";

    try {
        const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(roomId);
        const doc = await roomDocRef.get();
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5天後過期

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
        
        cleanupExpiredData(currentRoomId); // 進房順便掃地
        startChatListener(currentRoomId);
        updateUIForChat();

    } catch (error) {
        console.error("驗證錯誤:", error);
        alert("連線失敗，請稍後再試。");
        resetEntryButton();
    }
}

function resetEntryButton() {
    startChatButton.disabled = false;
    startChatButton.textContent = "開始群聊";
}

function updateInputState(remainingTime) {
    if (remainingTime > 0) {
        userInput.placeholder = `請等待 ${Math.ceil(remainingTime / 1000)} 秒後再發言`;
        userInput.disabled = true;
        sendButton.disabled = true;
    } else {
        userInput.placeholder = `[${currentUserName}] 正在對話...`;
        userInput.disabled = false;
        sendButton.disabled = false;
    }
}

function updateUIForChat() {
    roomEntryScreen.style.display = 'none';
    userInput.disabled = false;
    sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden');
    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴，協助大家溝通。`, 'system', 'Re:Family');
}

// --- 2. 訊息顯示 (包含破冰暗號過濾) ---

function displayMessage(content, type, senderName, timestamp) {
    // 🧊 C階段：過濾掉 AI 的暗號，不要顯示給使用者看
    const displayContent = content.replace('[TRIGGER_HUG]', '');

    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    
    let wrapperClass = type === 'user' ? 'items-end' : 'items-start';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';
    
    messageContainer.classList.add(type === 'user' ? 'justify-end' : 'justify-start');
    messageBubble.className = `p-4 rounded-2xl max-w-md ${bubbleClass}`;

    const headerHtml = `<div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div>`;
    
    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${wrapperClass}`;
    wrapper.innerHTML = headerHtml;
    
    messageBubble.innerHTML = cleanedContent;
    wrapper.appendChild(messageBubble);
    
    if (type !== 'user') {
        const icon = document.createElement('div');
        icon.className = 'w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0';
        icon.innerHTML = senderName === 'Re:Family' ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>';
        if(senderName === 'Re:Family') icon.className = 'w-8 h-8 bg-warm-peach rounded-full flex items-center justify-center flex-shrink-0';
        
        messageContainer.appendChild(icon);
        messageContainer.appendChild(wrapper);
    } else {
        const icon = document.createElement('div');
        icon.className = 'w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center flex-shrink-0';
        icon.innerHTML = '<i class="fas fa-user text-gray-600"></i>';
        messageContainer.appendChild(wrapper);
        messageContainer.appendChild(icon);
    }

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// --- 3. 破冰遊戲邏輯 (C階段核心) ---

// 顯示特效卡片
function showIcebreakerModal() {
    if (icebreakerOverlay) {
        icebreakerOverlay.classList.remove('hidden');
    }
}

// 撒花特效
function triggerConfetti() {
    if (!confettiContainer) return;
    
    confettiContainer.classList.remove('hidden');
    const colors = ['#FF8A65', '#FFAB91', '#F8BBD9', '#81C784', '#ffffff'];
    
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.classList.add('confetti');
        confetti.style.left = Math.random() * 100 + 'vw';
        confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
        confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
        
        confettiContainer.appendChild(confetti);
        
        // 動畫結束後移除元素
        setTimeout(() => confetti.remove(), 5000);
    }
    // 5秒後隱藏容器
    setTimeout(() => confettiContainer.classList.add('hidden'), 5000);
}

// 按下「我們擁抱了」按鈕
if (confirmHugButton) {
    confirmHugButton.addEventListener('click', () => {
        // 1. 發送系統訊息
        sendToDatabase("❤️ 我們已經完成擁抱了！(破冰成功)", sessionId, currentUserName, currentRoomId);
        
        // 2. 播放特效
        triggerConfetti();
        
        // 3. 關閉卡片
        icebreakerOverlay.classList.add('hidden');
    });
}

// --- 4. Firestore 監聽與 AI 邏輯 ---

let displayedMessageIds = new Set(); 

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;

    db.collection('rooms').doc(roomId).collection('messages')
      .orderBy('timestamp')
      .limit(50)
      .onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (!displayedMessageIds.has(change.doc.id)) {
                    displayedMessageIds.add(change.doc.id);
                    const isMe = msg.senderId === sessionId;
                    const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');
                    
                    // 🧊 C階段：偵測 AI 發出的暗號
                    if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_HUG]')) {
                        // 為了避免重新整理網頁時跳出舊的擁抱卡片，我們檢查時間
                        // 只有 1 分鐘內的新訊息才觸發卡片
                        if (Date.now() - msg.timestamp < 60000) {
                            showIcebreakerModal();
                        }
                    }

                    displayMessage(msg.text, type, msg.senderName, msg.timestamp);

                    if (msg.senderId !== 'AI') {
                        conversationHistory.push({role: 'user', text: `${msg.senderName}: ${msg.text}`});
                        conversationCount++;
                        if (isMe) checkAndTriggerAI(msg.text);
                    }
                }
            }
        });
    });
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5天後過期

    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, 
        senderId: senderId, 
        senderName: senderName, 
        timestamp: Date.now(),
        expireAt: expireDate
    });
}

// 🔥 改進點 1: 更靈敏的觸發邏輯
async function checkAndTriggerAI(lastText) {
    const now = Date.now();
    // 縮短冷卻時間：8秒
    if (now - lastAIMessageTime < 8000) return; 
    lastAIMessageTime = now;

    const triggers = [
        // 原有詞彙
        "煩", "累", "生氣", "吵架", "兇", "控制", "管", "報備", "一直傳", 
        "亂花錢", "浪費", "太貴", "省錢", "沒用", "閉嘴", "囉嗦", "不懂", "態度",
        "垃圾", "不想講", "隨便",
        // 🔥 新增：隱性衝突與質問詞彙
        "每次", "總是", "從來", "根本", "幹嘛", "為什麼", "又是", 
        "聽我說", "受夠", "以為", "藉口", "理由", "呵呵", "..."
    ];
    
    const hitKeyword = triggers.some(k => lastText.includes(k));
    
    // 🔥 改進：降低介入頻率門檻 (5句)
    if (hitKeyword || conversationCount % 5 === 0) {
        await triggerAIPrompt(hitKeyword);
    }
}

// 🔥 改進點 2: 更溫暖、更具善意的 Prompt
async function triggerAIPrompt(isEmergency) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const prompt = `
    你現在是「Re:Family」的家庭心理諮商師。你的任務不是評判對錯，而是**「說出對方心裡沒說出口的愛或擔憂」**。
    
    請分析以下對話，運用 **Satir (薩提爾) 冰山理論**：
    1. **看見行為底下的渴望：** 憤怒通常伴隨著「受傷」或「擔心」；冷漠通常伴隨著「無力感」。
    2. **翻譯善意：** 幫一方把「刺耳的話」翻譯成「背後的善意」給另一方聽。
       - 例如：指責「你都很晚回家」 -> 翻譯「其實他是很想念你，希望能多點時間相處」。
       - 例如：冷淡「隨便你」 -> 翻譯「他可能覺得無力，不知道該怎麼做才能讓你滿意」。

    **當前對話紀錄：**
    ${conversationHistory.slice(-5).map(m => m.text).join('\n')}

    **回應規則：**
    1. **溫暖而精準：** 使用「其實...」、「聽起來...」、「或許...」這類柔和的開頭。
    2. **字數限制：** 嚴格控制在 **50 字以內** (約 2-3 句話)。
    3. **破冰行動 (關鍵)：** 當你判斷對話陷入僵局（例如雙方重複爭執），或者你認為「現在就是擁抱的好時機」時，請務必在回應的**最後面**加上 [TRIGGER_HUG] 標籤。系統偵測到後會彈出擁抱任務卡片。
    4. **禁止：** 不要像機器人一樣說教，不要說「雙方都要冷靜」。

    請給我一句能瞬間軟化雙方防衛機制的「翻譯」：
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                // 🔥 允許稍微長一點的文字，讓 AI 完整表達
                generationConfig: { temperature: 0.7, maxOutputTokens: 150 } 
            })
        });
        
        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
        } else {
            console.warn("AI 忙碌中 (Silent)");
        }

    } catch (e) {
        console.error("AI Error (Silent)", e);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// --- INITIALIZATION ---

window.onload = function() {
    if (currentUserName && currentRoomId) {
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
        roomEntryScreen.style.display = 'flex';
        startChatButton.addEventListener('click', handleRoomEntry);
    }
    leaveRoomButton.addEventListener('click', handleLeaveRoom);
};

function handleLeaveRoom() {
    localStorage.clear();
    window.location.reload();
}

function handleSendAction() {
    const userText = userInput.value.trim();
    if (!currentRoomId || !userText) return;

    const now = Date.now();
    if (now - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;

    LAST_USER_SEND_TIME = now;
    sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
    userInput.value = '';
    
    updateInputState(COOLDOWN_TIME);
    const timer = setInterval(() => {
        const remaining = COOLDOWN_TIME - (Date.now() - LAST_USER_SEND_TIME);
        updateInputState(remaining);
        if (remaining <= 0) {
            clearInterval(timer);
            updateInputState(0);
        }
    }, 1000);
}

sendButton.addEventListener('click', handleSendAction);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); handleSendAction(); }
});
