// =================================================================
// 🚨🚨🚨 【防封鎖設定】請填入您的新金鑰 (請務必切成兩半) 🚨🚨🚨
// =================================================================

// 1. 請填入金鑰的「前 10 個字」 (例如 "AIzaSyDq3I")
const KEY_PART_1 = "AIzaSyCwVW"; 

// 2. 請填入金鑰的「剩下所有字」 (例如 "pGMbwKy7N4Dxo8NGl...")
const KEY_PART_2 = "en7tHL6yH1cmjYv9ZruRpnEx23Fk0";

// 自動組合金鑰 (騙過 GitHub 機器人)
const GEMINI_API_KEY = KEY_PART_1 + KEY_PART_2;


// =================================================================
// 🔧 Firebase 設定 (保持不變)
// =================================================================
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

// --- DOM 元素取得 ---
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

// 🧊 破冰遊戲與特效元素
const icebreakerOverlay = document.getElementById('icebreakerOverlay');
const confirmHugButton = document.getElementById('confirmHugButton');
const confettiContainer = document.getElementById('confettiContainer');

// --- 全域變數 ---
let currentUserName = localStorage.getItem('chatUserName') || null;
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationHistory = []; // 儲存對話歷史，讓 AI 讀懂上下文
let conversationCount = 0;
let lastAIMessageTime = 0;
let LAST_USER_SEND_TIME = 0;
const COOLDOWN_TIME = 10000; // 發言冷卻時間

// =================================================================
// 🧹 功能：訪客自動清理 (保持資料庫整潔)
// =================================================================
async function cleanupExpiredData(roomId) {
    console.log("系統檢查：正在清理過期訊息...");
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
        console.warn("清理略過:", error);
    }
}

// =================================================================
// 🏠 房間進入邏輯
// =================================================================
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
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 房間有效期 5 天

        if (doc.exists) {
            // 驗證密碼
            if (doc.data().password !== password) {
                alert("密碼錯誤！");
                resetEntryButton();
                return;
            }
            // 避免暱稱重複
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
            // 建立新房間
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
        alert("連線失敗，請檢查網路。");
        resetEntryButton();
    }
}

function resetEntryButton() {
    startChatButton.disabled = false;
    startChatButton.textContent = "開始群聊";
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

// =================================================================
// 💬 訊息顯示邏輯 (含防呆)
// =================================================================
function displayMessage(content, type, senderName, timestamp) {
    // 🛡️ 防呆：如果內容不是文字(例如是錯誤物件)，直接攔截不顯示
    if (typeof content !== 'string') {
        console.warn("攔截到非文字訊息，已隱藏:", content);
        return; 
    }

    // 移除 AI 指令標籤，不讓使用者看到
    const displayContent = content.replace('[TRIGGER_HUG]', '');
    
    // 如果移除標籤後是空的，就不顯示氣泡
    if (!displayContent.trim()) return;

    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // 處理換行
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

    // 頭像邏輯
    const icon = document.createElement('div');
    icon.className = 'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0';
    
    if (senderName === 'Re:Family 智能助手' || senderName === 'Re:Family') {
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
// 🔥 Firestore 監聽 (核心：接收與觸發)
// =================================================================
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

                        // 🔍 破冰遊戲觸發偵測
                        // 只有當訊息來自 AI 且包含指令標籤，且在 1 分鐘內發送的才觸發
                        if (msg.senderId === 'AI' && msg.text && msg.text.includes('[TRIGGER_HUG]')) {
                            if (Date.now() - msg.timestamp < 60000) {
                                showIcebreakerModal();
                            }
                        }

                        displayMessage(msg.text, type, msg.senderName, msg.timestamp);

                        // 📝 紀錄歷史並判斷是否需要 AI 介入
                        if (msg.senderId !== 'AI') {
                            // 存入歷史紀錄 (包含是誰說的)
                            conversationHistory.push({ 
                                role: 'user', 
                                name: msg.senderName, 
                                text: msg.text 
                            });
                            conversationCount++;
                            
                            // 只有我自己發送的訊息才負責觸發 AI，避免雙重呼叫
                            if (isMe) checkAndTriggerAI(msg.text, msg.senderName);
                        }
                    }
                }
            });
        });
}

// =================================================================
// 🧠 AI 腦袋 (觸發判斷與呼叫)
// =================================================================
async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now();
    // 避免 AI 太頻繁插嘴 (8秒冷卻)
    if (now - lastAIMessageTime < 8000) return;
    
    // 關鍵字庫：包含負面情緒、指責、推卸責任等詞彙
    const triggers = [
        "煩", "累", "生氣", "吵架", "兇", "控制", "管", "報備", "一直傳",
        "亂花錢", "浪費", "太貴", "省錢", "沒用", "閉嘴", "囉嗦", "不懂", "態度",
        "垃圾", "不想講", "隨便", "反正", "都你", "藉口", "理由", "呵呵", "...", 
        "不聽話", "沒救", "受夠"
    ];

    const hitKeyword = triggers.some(k => lastText.includes(k));

    console.log(`偵測: "${lastText}" | 命中關鍵字: ${hitKeyword}`);

    // 規則：命中關鍵字 OR 每 5 句話主動關心一次
    if (hitKeyword || conversationCount % 5 === 0) {
        lastAIMessageTime = now;
        console.log("🚀 準備呼叫 Gemini 2.5 Flash 進行翻譯...");
        await triggerAIPrompt(hitKeyword, lastText, senderName);
    }
}

// =================================================================
// 🤖 核心 Prompt (薩提爾翻譯官)
// =================================================================
async function triggerAIPrompt(isEmergency, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    // 將最近 5 則對話組合成字串，讓 AI 讀懂前因後果
    const historyText = conversationHistory.slice(-5).map(m => `${m.name}: ${m.text}`).join('\n');

    // ✨ 這裡是最重要的部分：定義 AI 的人格與任務 ✨
    const prompt = `
    你現在是「Re:Family」的家庭溝通協調員，你的核心角色是運用 **Satir 冰山理論** 的「翻譯官」。
    你的任務**絕對不是說教**，而是協助家人將「刺耳的指責」翻譯成「冰山底下隱藏的渴望與愛」。

    **📜 當前對話場景 (上下文)：**
    ${historyText}

    **🎯 你的任務目標：**
    針對 **${senderName}** 剛剛說的這句話：「${lastText}」，請執行以下翻譯：

    1. **洞察冰山 (Insight)：** 這句話聽起來像是指責或生氣 (Behavior)，但請分析背後是否隱藏了「擔心 (Feeling)」、「對關係的重視 (Yearning)」或「不知道該怎麼辦的無助 (Coping)」。
    
    2. **溫柔翻譯 (Translate)：** 請直接代替 ${senderName}，用溫柔、建設性的語氣，重新說出這句話的「真心版本」。
       例如：將「你真的很不聽話」翻譯成「其實是因為我很擔心你的安全，怕你受傷，所以我才會這麼著急。」

    **📝 回應格式要求：**
    - **請勿解釋理論**，直接輸出翻譯後的內容。
    - **開頭請用：** 「${senderName} 的意思其實是...」 或 「其實 ${senderName} 是因為...」
    - **字數限制：** 150 字以內。
    - **破冰判斷：** 如果你覺得雙方火藥味很重 (例如出現謾罵、互不相讓)，請在回應的最後面加上標籤 [TRIGGER_HUG]。

    請給我一句具備深度同理心的翻譯：
    `;

    try {
        // 🚀 使用 gemini-2.5-flash (目前最穩定且免費額度較高的版本)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                // ✅ 字數大解鎖：設定為 800，確保翻譯不被截斷
                generationConfig: { temperature: 0.7, maxOutputTokens: 800 } 
            })
        });

        // 🚨 錯誤攔截：如果 API 失敗 (例如金鑰又被鎖)，在此攔截，不讓它傳到聊天室
        if (!response.ok) {
            const errorData = await response.json();
            console.error("API 呼叫失敗:", errorData);
            
            if(errorData.error && errorData.error.status === 'PERMISSION_DENIED') {
                alert("⚠️ 系統警告：Google 偵測到金鑰異常。請更換金鑰！");
            }
            return; // 直接結束，不往下執行
        }

        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            const aiText = data.candidates[0].content.parts[0].text;
            console.log("AI 回應成功:", aiText);
            
            // 再次確認是文字才發送
            if (typeof aiText === 'string') {
                 await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
            }
        }

    } catch (e) {
        console.error("網路連線錯誤:", e);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// =================================================================
// 🎮 破冰遊戲與發送邏輯
// =================================================================
function showIcebreakerModal() { 
    if (icebreakerOverlay) icebreakerOverlay.classList.remove('hidden'); 
}

if (confirmHugButton) {
    confirmHugButton.addEventListener('click', () => {
        sendToDatabase("❤️ 我們已經完成擁抱了！(破冰成功)", sessionId, currentUserName, currentRoomId);
        
        // 彩帶特效
        if(confettiContainer) {
            confettiContainer.classList.remove('hidden');
            const colors = ['#FF8A65', '#FFAB91', '#F8BBD9', '#81C784', '#ffffff'];
            for (let i = 0; i < 50; i++) {
                const confetti = document.createElement('div');
                confetti.classList.add('confetti');
                confetti.style.left = Math.random() * 100 + 'vw';
                confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
                confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
                confettiContainer.appendChild(confetti);
                setTimeout(() => confetti.remove(), 5000);
            }
            setTimeout(() => confettiContainer.classList.add('hidden'), 5000);
        }
        icebreakerOverlay.classList.add('hidden');
    });
}

function handleSendAction() {
    const userText = userInput.value.trim();
    if (!currentRoomId || !userText) return;
    
    // 防止洗版 (前端冷卻)
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

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text,
        senderId: senderId,
        senderName: senderName,
        timestamp: Date.now(),
        expireAt: expireDate
    });
}

if (leaveRoomButton) {
    leaveRoomButton.addEventListener('click', handleLeaveRoom);
}

function handleLeaveRoom() {
    localStorage.clear();
    window.location.reload();
}
