// 🚨 1. 替換成您在 Google AI Studio 取得的 Gemini API 金鑰
const GEMINI_API_KEY = "AIzaSyAmCXDOyy2Ee-3R13JBZQPYg_pQpJjZASc"; 

// 🚨 2. 替換成您在 Firebase Console 的配置 (必須填寫！)
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

// --- 1. 房間與 UI 邏輯 ---

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
                active_users: firebase.firestore.FieldValue.arrayUnion(userName)
            });
        } else {
            await roomDocRef.set({
                password: password,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                active_users: [userName]
            });
        }

        currentRoomId = roomId;
        currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId);
        localStorage.setItem('chatUserName', currentUserName);
        
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

function displayMessage(content, type, senderName, timestamp) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

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

// --- 3. FIRESTORE & AI LOGIC (核心修正) ---

let displayedMessageIds = new Set(); 

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;

    db.collection(roomId).orderBy('timestamp').limit(50).onSnapshot(snapshot => {
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const msg = change.doc.data();
                if (!displayedMessageIds.has(change.doc.id)) {
                    displayedMessageIds.add(change.doc.id);
                    const isMe = msg.senderId === sessionId;
                    const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');
                    
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
    await db.collection(roomId).add({
        text: text, senderId: senderId, senderName: senderName, timestamp: Date.now()
    });
}

async function checkAndTriggerAI(lastText) {
    const now = Date.now();
    if (now - lastAIMessageTime < 10000) return; 
    lastAIMessageTime = now;

    const triggers = [
        "煩", "累", "生氣", "吵架", "兇", "控制", "管", "報備", "一直傳", 
        "亂花錢", "浪費", "太貴", "省錢", "沒用", "閉嘴", "囉嗦", "不懂", "態度",
        "垃圾", "不想講", "隨便"
    ];
    
    const hitKeyword = triggers.some(k => lastText.includes(k));
    
    if (hitKeyword || conversationCount % 8 === 0) {
        await triggerAIPrompt(hitKeyword);
    }
}

async function triggerAIPrompt(isEmergency) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const prompt = `
    你現在是「Re:Family」家庭溝通協調員。你的角色是**敏銳的觀察者**與**文化翻譯官**。
    請運用 **Satir (薩提爾) 模式** 與 **Bowen 理論**，協助家庭成員「翻譯」彼此的話語：
    1. **關心 vs. 控制**：(翻譯：將父母的控制翻譯為焦慮，子女的反抗翻譯為求獨立)
    2. **金錢價值觀**：(翻譯：將省錢翻譯為安全感，花錢翻譯為體驗)
    3. **尊重與界線**：(翻譯：將建議翻譯為不被尊重)

    **當前對話紀錄：**
    ${conversationHistory.slice(-5).map(m => m.text).join('\n')}

    **請嚴格遵守以下規則：**
    1. **極簡短：** 回應絕對不能超過 2 句話 (約 40 字)。
    2. **任務：** - **不要再安撫了，請直接「翻譯」！**
       - 範例：「孩子這句話聽起來很衝，但其實是在說：『我也希望被信任』，對嗎？」
       - 範例：「爸爸這麼生氣，是不是因為太擔心你會在外面受傷？」
    3. **破冰：** 只有在對話完全卡住時，才建議：「要不要試試看，現在給對方一個擁抱？」
    4. **禁止：** 不要素質教育、不要長篇大論。
    
    請生成一句具備洞察力的翻譯語句：
    `;

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: prompt }] }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 100 } 
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
