// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// 獲取 Room 入口介面元素
const roomEntryScreen = document.getElementById('roomEntryScreen');
const roomIdInput = document.getElementById('roomIdInput');
const userNameInput = document.getElementById('userNameInput');
const startChatButton = document.getElementById('startChatButton');
const statusDisplay = document.getElementById('current-user-status');
const leaveRoomButton = document.getElementById('leaveRoomButton'); 


// 獲取 Firestore 實例 (依賴 index.html 中的初始化)
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;

// --- 身份識別與房間狀態 (儲存在瀏覽器本地) ---
let currentUserName = localStorage.getItem('chatUserName') || null; 
let currentRoomId = localStorage.getItem('chatRoomId') || null;
// 使用 Session ID 作為裝置唯一 ID
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);


// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; 
let lastAIMessageTime = 0; 
// 🌟 核心：追蹤用戶上次發言時間 (用於前端 10 秒硬性鎖定) 🌟
let LAST_USER_SEND_TIME = 0; 
const COOLDOWN_TIME = 10000; // 10 秒


// --- 1. DISPLAY MESSAGE & UI LOGIC ---

function updateUIForChat() {
    roomEntryScreen.style.display = 'none'; // 隱藏房間入口
    userInput.placeholder = `[${currentUserName}] 正在與家人對話... (10秒後可再次發言)`;
    userInput.disabled = false;
    sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden'); // 顯示退出按鈕
    
    // 更新頂部導航欄狀態
    statusDisplay.textContent = `Room: ${currentRoomId} | 暱稱: ${currentUserName}`;

    // 顯示歡迎語
    chatArea.innerHTML = '';
    
    // 溫和歡迎語 (分段發送)
    displayMessage(`歡迎您，${currentUserName}！這裡是家庭調解室 [${currentRoomId}]。`, 'system', 'Re:Family 智能助手');
    setTimeout(() => {
        displayMessage(`我會在這裡傾聽並協調您和家人的溝通。請先深呼吸，當您準備好時，隨時都可以告訴我發生了什麼事。`, 'system', 'Re:Family 智能助手');
    }, 1500); 
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

function displayMessage(content, type, senderName, timestamp) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let headerHtml = '';

    if (type === 'user') { // 當前用戶
        messageContainer.classList.add('justify-end');
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = '<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>';
        
        // 修正：匿名模式下，用戶自己的發言頭部顯示名字
        senderName = senderName || currentUserName || '您';
        headerHtml = `<div class="text-xs text-right text-gray-500 dark:text-gray-400 mb-1"><strong>${senderName}</strong> <span class="font-normal">${timeStr}</span></div>`;
        
        const wrapper = document.createElement('div');
        wrapper.classList.add('flex', 'flex-col', 'items-end');
        wrapper.innerHTML = headerHtml;
        messageBubble.innerHTML = cleanedContent;
        wrapper.appendChild(messageBubble);

        messageContainer.appendChild(wrapper);
        messageContainer.appendChild(userIcon);
        
    } else { // AI 或其他使用者 (靠左)
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        
        const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        
        let headerHtml = '';
        
        if (senderName === 'Re:Family 智能助手') {
             aiIcon.innerHTML = `<i class="fas fa-heart text-white text-xs"></i>`;
             headerHtml = `<div class="text-xs text-left text-gray-500 dark:text-gray-400 mb-1"><strong>Re:Family 智能助手</strong> <span class="font-normal">${timeStr}</span></div>`;
        } else {
             aiIcon.innerHTML = `<i class="fas fa-users text-white text-xs"></i>`; // 其他匿名使用者
             headerHtml = `<div class="text-xs text-left text-gray-500 dark:text-gray-400 mb-1"><strong>${senderName}</strong> <span class="font-normal">${timeStr}</span></div>`;
        }
        
        const wrapper = document.createElement('div');
        wrapper.classList.add('flex', 'flex-col', 'items-start');
        wrapper.innerHTML = headerHtml;
        messageBubble.innerHTML = cleanedContent;
        wrapper.appendChild(messageBubble);

        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(wrapper);
    }
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


// --- 4. FIRESTORE & AI LOGIC ---

let displayedMessageIds = new Set(); 

function startChatListener(roomId) {
    if (!db) return;

    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;

    // 🌟 核心：監聽特定 Room ID 的集合 🌟
    db.collection(roomId).orderBy('timestamp').limit(50).onSnapshot(snapshot => {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const message = change.doc.data();
                const messageId = change.doc.id;

                if (!displayedMessageIds.has(messageId)) {
                    displayedMessageIds.add(messageId);
                    
                    const isCurrentUser = message.senderId === sessionId;
                    const messageType = message.senderId === 'AI' ? 'system' : (isCurrentUser ? 'user' : 'other');
                    const senderDisplayName = message.senderId === 'AI' ? 'Re:Family 智能助手' : message.senderName;

                    displayMessage(message.text, messageType, senderDisplayName, message.timestamp);

                    // 🌟 觸發 AI 法官判斷 (只有當前使用者發送時才觸發 AI 邏輯) 🌟
                    if (message.senderId !== 'AI' && isCurrentUser) {
                        checkAndTriggerAI(message);
                    }
                }
            }
        });
    });
}


async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db || text.trim() === '') return;

    await db.collection(roomId).add({
        text: text,
        senderId: senderId,
        senderName: senderName,
        timestamp: Date.now()
    }).catch(error => {
        console.error("寫入資料庫失敗:", error);
        alert("🚨 寫入資料庫失敗。請檢查您的網路連線或 Firestore 安全規則！"); 
        sendButton.disabled = false;
        userInput.disabled = false;
    });
}


async function checkAndTriggerAI(lastUserMessage) {
    // 獲取最新的 10 條訊息作為歷史記錄
    const snapshot = await db.collection(currentRoomId)
        .orderBy('timestamp', 'desc')
        .limit(10) 
        .get();

    conversationHistory = [];
    snapshot.docs.reverse().forEach(doc => {
        const data = doc.data();
        const role = data.senderId === 'AI' ? 'model' : 'user'; 
        conversationHistory.push({ role: role, text: data.text });
    });
    
    let userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    conversationCount = userMessageCount;
    
    // 限制 5 秒內不重複觸發 AI (AI 自己發言的間隔)
    const currentTime = Date.now();
    if (currentTime - lastAIMessageTime < 5000) {
        return; 
    }
    lastAIMessageTime = currentTime;

    // 核心 AI 邏輯：只在偵測到負面情緒或達到挑戰次數時回覆
    const negativeKeywords = ["好煩", "很累", "不舒服", "難過", "生氣", "吵架", "兇", "委屈", "太過分", "無奈", "崩潰", "壓力", "控制", "吝嗇", "不尊重", "亂花錢", "不必要"];
    const shouldRespond = negativeKeywords.some(keyword => lastUserMessage.text.includes(keyword));

    // 觸發條件：1. 偵測到負面情緒 OR 2. 累計發言達到 3 次
    if (shouldRespond || conversationCount >= 3) {
        await triggerAIPrompt(lastUserMessage.text);
    }
}


async function triggerAIPrompt(lastUserText) {

    let promptInstruction = `
    你現在是Re:Family家庭溝通引導者，是群聊中的協調員。
    你的職責是：觀察並在關鍵時刻（情緒低落或衝突時）介入。
    **重要原則：你必須極度簡短，發言長度不應超過任一位家庭成員的單段發言長度。你的目的是輔助，而非主導。**

    重要限制：在你的所有回覆中，絕對不能使用任何粗體標記符號，例如 **、# 或 * 等符號。
    
    你必須將輔導和提問圍繞在以下核心家庭矛盾的模式：
    1. 家人對我的關心被我認為是控制。
    2. 對我花費的擔憂被我認為是吝嗇的。
    3. 對我未來規劃的建議被我認為是不尊重的。
    
    當前使用者實際輸入次數: ${conversationCount}.
    對話紀錄：
    ---
    ${conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n')}
    ---
    
    請遵循以下流程：
    
    1. **如果偵測到負面情緒 (shouldRespond=true) 或對話回合少於 3 次：**
       - 回覆結構必須是：[同理心安撫與肯定感受 (1句)] ||| [溫和的引導與釐清問題 (1句)]。
       - **安撫段落內容：** 必須極短，只針對情緒提供支持 (例如：看到你說...，感覺很不好受，我在這裡陪伴你)。
       - **溫和提問：** 提問應是為了釐清背後模式，並將發言權交回群組。
       - 回覆格式：[安撫段落] ||| [溫和提問，將發言權交回群組]
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須直接跳到解決方案。
       - 回覆格式：[溫和總結] ||| [溫馨互動挑戰內容] ||| [鼓勵與開放式結語]
       
    (請參照挑戰清單並在第二段中詳細說明挑戰內容。清單：情感表達、肢體暖心、共識重建、換位思考。)
    
    你的回覆必須僅包含 AI 建議的內容（不包含任何註解或格式說明）。
    `;

    try {
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');

        // 修正 Invalid JSON payload received 錯誤：config 替換為 generationConfig
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptInstruction }] }],
                generationConfig: { temperature: 0.7 } 
            })
        });

        const data = await response.json();
        
        let aiResponse = "";
        
        if (data.candidates && data.candidates.length > 0) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error && data.error.message.includes("overloaded")) {
             // 捕捉到過載錯誤，回傳新的極簡短安撫語句
             // 🚨 這裡就是防止您不希望的重複訊息出現的關鍵 🚨
             aiResponse = "溝通服務擁塞。請家人們繼續對話，我會安靜等待。";
        } else if (data.error) {
             // 捕捉到其他 API 錯誤
             aiResponse = `系統連線暫時中斷。請稍後再試。`;
        }
        
        // 寫入資料庫，讓所有人看到 AI 回覆
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        for (const part of responseParts) {
             await sendToDatabase(part, 'AI', 'Re:Family 智能助手', currentRoomId);
             await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬打字間隔
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
        // 最終捕捉網路連線失敗，發送最簡單的錯誤提示
        await sendToDatabase("網路連線失敗，請稍後重試。", 'AI', 'Re:Family 智能助手', currentRoomId);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        sendButton.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}


// --- 3. 事件監聽與啟動 (Coldown Logic) ---

window.onload = function() {
    // 檢查是否有存儲的暱稱和房間 ID，如果有則跳過 Room Entry Screen
    if (currentUserName && currentRoomId) {
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
         // 顯示 Room Entry Screen
         roomEntryScreen.style.display = 'flex';
         startChatButton.addEventListener('click', handleRoomEntry);
         leaveRoomButton.classList.add('hidden'); // 隱藏退出按鈕
         // 確保按鈕和輸入框是不可用的
         userInput.disabled = true;
         sendButton.disabled = true;
    }
    
    leaveRoomButton.addEventListener('click', handleLeaveRoom);
};

function handleLeaveRoom() {
    localStorage.removeItem('chatRoomId');
    localStorage.removeItem('chatUserName');
    currentRoomId = null;
    currentUserName = null;
    
    window.location.reload(); 
}


function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, ''); // 僅允許字母數字
    const userName = userNameInput.value.trim();

    if (!roomId || !userName) {
        alert("請輸入有效的房間代碼和暱稱！");
        return;
    }

    currentRoomId = roomId;
    currentUserName = userName;
    localStorage.setItem('chatRoomId', currentRoomId);
    localStorage.setItem('chatUserName', currentUserName);

    startChatListener(currentRoomId);
    updateUIForChat();
}


// 核心發送邏輯
function handleSendAction() {
    const userText = userInput.value.trim();
    if (!currentRoomId || !currentUserName || !userText) return;

    const currentTime = Date.now();
    const elapsedTime = currentTime - LAST_USER_SEND_TIME;
    const remainingTime = COOLDOWN_TIME - elapsedTime;

    if (remainingTime > 0) {
        // 🚨 硬性阻止發送並更新 UI 🚨
        updateInputState(remainingTime);
        return; 
    }

    // 設置發言間隔
    LAST_USER_SEND_TIME = currentTime;
    
    sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
    userInput.value = '';

    // 鎖定 UI 並開始倒計時
    updateInputState(COOLDOWN_TIME);
    
    // 開始定時器，每秒更新提示
    const timer = setInterval(() => {
        const newTime = Date.now();
        const newRemaining = COOLDOWN_TIME - (newTime - LAST_USER_SEND_TIME);
        
        updateInputState(newRemaining);
        
        if (newRemaining <= 0) {
            clearInterval(timer);
            updateInputState(0);
        }
    }, 1000);
}


// 恢復點擊與 Enter 鍵事件監聽
sendButton.addEventListener('click', handleSendAction);
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        handleSendAction();
    }
});
