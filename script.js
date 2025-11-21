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

// --- 1. SESSION ID 持久化 (關鍵修正) ---
// 確保 sessionId 只有在第一次訪問時生成，之後都從 localStorage 讀取
let sessionId = localStorage.getItem('deviceSessionId');
if (!sessionId) {
    sessionId = `anon_${Math.random().toString(36).substr(2, 9)}_${Date.now()}`;
    localStorage.setItem('deviceSessionId', sessionId);
}

let currentUserName = localStorage.getItem('chatUserName') || null; 
let currentRoomId = localStorage.getItem('chatRoomId') || null;

let conversationHistory = [];
let conversationCount = 0; 
let lastAIMessageTime = 0; 
let LAST_USER_SEND_TIME = 0; 
const COOLDOWN_TIME = 10000; 

// --- 2. ROOM LOGIC ---

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
            const data = doc.data();
            if (data.password !== password) {
                alert("密碼錯誤！");
                resetEntryButton();
                return;
            }
            
            // 檢查暱稱是否被「其他裝置」使用
            // 注意：這裡只做簡單檢查，如果 Firestore 裡有這個名字，就提示
            if (data.active_users && data.active_users.includes(userName)) {
                 // 如果是本人重連 (sessionId 相同)，理論上不會有問題
                 // 但如果是切換房間後回來，名字可能還在
                 const confirmUse = confirm(`暱稱 "${userName}" 顯示已在房間中。這是您剛離開的連線嗎？\n(是本人請按確定，若是重名請按取消並更換暱稱)`);
                 if (!confirmUse) {
                     resetEntryButton();
                     return;
                 }
            }
            
            // 將暱稱加入活躍列表
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

async function handleLeaveRoom() {
    if (!currentRoomId || !currentUserName) {
        performLocalLogout();
        return;
    }

    // 嘗試從 Firestore 移除自己的暱稱
    try {
        await db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId).update({
            active_users: firebase.firestore.FieldValue.arrayRemove(currentUserName)
        });
    } catch (e) {
        console.error("移除用戶狀態失敗 (可能房間已刪除或網路問題)", e);
    }

    performLocalLogout();
}

function performLocalLogout() {
    localStorage.removeItem('chatRoomId');
    localStorage.removeItem('chatUserName');
    // 注意：不要移除 deviceSessionId，保持裝置身份
    currentRoomId = null;
    currentUserName = null;
    window.location.reload();
}

// --- 3. UI & CHAT LOGIC ---

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
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴。`, 'system', 'Re:Family');
}

function displayMessage(content, type, senderName, timestamp) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    // 格式化時間
    let timeStr = '';
    if (timestamp) {
        const date = timestamp instanceof firebase.firestore.Timestamp ? timestamp.toDate() : new Date(timestamp);
        timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

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
                    
                    // 🌟 核心修正：使用持久化的 sessionId 判斷是否為自己 🌟
                    const isMe = msg.senderId === sessionId;
                    const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');
                    
                    displayMessage(msg.text, type, msg.senderName, msg.timestamp);

                    if (msg.senderId !== 'AI') {
                        conversationHistory.push({role: 'user', text: `${msg.senderName}: ${msg.text}`});
                        conversationCount++;
                        // 只有是自己發的訊息，才觸發 AI 檢查 (避免多人同時觸發)
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

// --- 4. AI LOGIC ---

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

async function triggerAIPrompt() {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');

    const prompt = `
    你現在是「Re:Family」家庭溝通協調員。你的角色是**極度被動**的觀察者。
    你的任務是運用 **Satir (薩提爾) 模式**，協助解決以下核心矛盾：
    1. 關心被誤解為控制
    2. 金錢觀念差異
    3. 建議被誤解為不尊重

    **當前對話紀錄：**
    ${conversationHistory.slice(-5).map(m => m.text).join('\n')}

    **請嚴格遵守：**
    1. **極簡短：** 回應絕對不能超過 2 句話 (約 40 字)。
    2. **結構：** [同理情緒] + [翻譯深層需求]。
    3. **禁止事項：** 不要說教、不要長篇大論、不要使用 Markdown 粗體。
    
    請生成一句溫和的協調語句：
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

// --- 5. INITIALIZATION ---

window.onload = function() {
    if (currentUserName && currentRoomId) {
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
        roomEntryScreen.style.display = 'flex';
        startChatButton.addEventListener('click', handleRoomEntry);
    }
    leaveRoomButton.addEventListener('click', handleLeaveRoom);
    
    // 視窗關閉前嘗試移除 (不保證成功)
    window.addEventListener('beforeunload', () => {
        if (currentRoomId && currentUserName) {
             // 使用 Beacon API 發送請求 (比 fetch 更適合在 unload 時使用)
             // 但由於這需要後端支持，我們這裡只能盡力而為
        }
    });
};

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
