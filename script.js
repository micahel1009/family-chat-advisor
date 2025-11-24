// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

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

const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const ROOMS_METADATA_COLLECTION = 'rooms_metadata';

let currentUserName = localStorage.getItem('chatUserName') || null; 
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationHistory = [];
let conversationCount = 0; 
let lastAIMessageTime = 0; 
let LAST_USER_SEND_TIME = 0; 
const COOLDOWN_TIME = 10000; 

// --- 1. ROOM & UI LOGIC ---
// (保持不變)
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
        userInput.placeholder = `[${currentUserName}] 正在與家人對話...`;
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
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴。`, 'system', 'Re:Family');
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

// --- 3. FIRESTORE & AI LOGIC ---

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
        "幾點回家", "去哪裡", "報備", "一直傳", "為什麼不回", "控制", 
        "亂花錢", "浪費", "太貴", "沒必要", "省錢", "賺錢辛苦", 
        "你懂什麼", "沒用", "閉嘴", "囉嗦", "煩", "不想講", "已讀", 
        "好累", "崩潰", "受不了"
    ];
    
    const hitKeyword = triggers.some(k => lastText.includes(k));
    
    if (hitKeyword || conversationCount % 8 === 0) {
        await triggerAIPrompt();
    }
}

// 🌟 核心 AI Prompt (注入諮商理論與社會學) 🌟
async function triggerAIPrompt() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const prompt = `
    你現在是「Re:Family」家庭溝通協調員。你的角色是**極度被動**的觀察者，也是一位**具備諮商技巧的翻譯官**。
    你的任務是結合 **Satir (薩提爾) 模式**、**Bowen 家庭系統理論** 與 **Bourdieu (布迪厄) 慣習理論**，協助家庭成員從「情緒反應」走向「覺察與理解」。

    **請針對以下三個核心矛盾進行「文化翻譯」與「情緒辨識」：**
    1. **關心 vs. 控制**：將父母的焦慮翻譯為「害怕失去掌控 + 擔心受傷」；將子女的抗拒翻譯為「希望被信任 + 獨立需求」。
    2. **金錢價值觀**：將父母的省錢慣習翻譯為「生存資本/安全感」；將子女的花費翻譯為「社交資本/體驗」。
    3. **尊重與界線**：當出現指導/命令時，提醒父母轉為「支持者」，尊重子女作為成年人的選擇權。

    **當前對話紀錄：**
    ${conversationHistory.slice(-5).map(m => m.text).join('\n')}

    **請嚴格遵守以下回應規則：**
    1. **極簡短：** 回應絕對不能超過 2 句話 (約 40 字)。
    2. **功能 - 轉譯 (Emotion Identification)：** 不要只說「別生氣」，而是試著**翻譯**話語背後的善意或需求。
       - 範例：「這句話聽起來像指責，但背後是不是藏著擔心受傷的心情呢？」
       - 範例：「爸爸提到的省錢，或許是過去養成的生存習慣，而不僅是針對你。」
    3. **功能 - 覺察 (Self-awareness)：** 引導雙方看見自己的情緒。
    4. **禁止事項：** 不要說教、不要長篇大論、不要使用 Markdown 粗體。
    
    請生成一句溫和、具備洞察力的協調語句：
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
        let aiText = "";

        if (data.candidates) {
            aiText = data.candidates[0].content.parts[0].text;
        } else {
            console.warn("AI 暫無回應"); 
            return;
        }
        
        await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);

    } catch (e) {
        console.error("AI Error", e);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}

// --- INITIALIZATION & 10s Cooldown ---

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

// 10秒冷卻邏輯
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
