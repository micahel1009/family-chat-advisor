// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
// ！！！ 注意：此模式金鑰會暴露在前端，請使用臨時金鑰 ！！！
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

// 獲取 Firestore 實例 (已在 index.html 中初始化)
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;

// --- 身份識別與房間狀態 ---
let currentUserName = localStorage.getItem('chatUserName') || null; 
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);


// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; 
let lastMessageTime = 0; 


// --- 1. UTILITY & UI FUNCTIONS ---

function updateUIForChat() {
    roomEntryScreen.style.display = 'none';
    userInput.placeholder = `正在與 [${currentRoomId}] 聊天室對話...`;
    userInput.disabled = false;
    sendButton.disabled = false;
    
    // 顯示歡迎語
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}！這裡是家庭調解室 [${currentRoomId}]。`, 'system', 'Re:Family 智能助手');
    setTimeout(() => {
       displayMessage(`我會在這裡傾聽並協調您和家人的溝通。請先深呼吸，當您準備好時，隨時都可以告訴我發生了什麼事。`, 'system', 'Re:Family 智能助手');
    }, 1500); 
}

function displayMessage(content, type, senderName, timestamp) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    let headerHtml = '';
    if (senderName && type !== 'user') {
         const timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
         headerHtml = `<div class="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 flex justify-between items-center"><span>${senderName}</span><span class="font-normal">${timeStr}</span></div>`;
    }

    if (type === 'user') {
        messageContainer.classList.add('justify-end');
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = '<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>';
        
        messageBubble.innerHTML = `<strong>${senderName}</strong><br>` + cleanedContent;
        messageContainer.appendChild(messageBubble);
        messageContainer.appendChild(userIcon);
        
    } else {
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        
        if (senderName === 'Re:Family 智能助手') {
             aiIcon.innerHTML = `<i class="fas fa-heart text-white text-xs"></i>`;
             messageBubble.innerHTML = `<strong>${senderName}</strong><br>` + cleanedContent;
        } else {
             aiIcon.innerHTML = headerHtml + cleanedContent;
        }
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


// --- 3. FIRESTORE LOGIC ---

let displayedMessageIds = new Set(); 

function startChatListener(roomId) {
    if (!db) return;

    // 清空舊的聊天內容，並開始監聽新的 Room ID
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationHistory = [];
    conversationCount = 0;

    // 🌟 核心：監聽特定 Room ID 的集合 🌟
    db.collection(roomId).orderBy('timestamp').limit(100).onSnapshot(snapshot => {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const message = change.doc.data();
                const messageId = change.doc.id;

                if (!displayedMessageIds.has(messageId)) {
                    displayedMessageIds.add(messageId);
                    
                    const isCurrentUser = message.senderId === sessionId;
                    const messageType = message.senderId === 'AI' ? 'system' : (isCurrentUser ? 'user' : 'other');

                    // 渲染到聊天室
                    displayMessage(message.text, messageType, message.senderName, message.timestamp);

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
        displayMessage("🚨 系統錯誤：訊息未能送出。", 'system', '系統');
    });
}


// --- 4. AI LOGIC ---

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
    
    // 限制 AI 回覆頻率 (5 秒內不重複觸發 AI)
    const currentTime = Date.now();
    if (currentTime - lastMessageTime < 5000) {
        return; 
    }
    lastMessageTime = currentTime;

    await triggerAIPrompt(lastUserMessage.text);
}


async function triggerAIPrompt(lastUserText) {

    let promptInstruction = `
    你現在是Re:Family家庭溝通引導者。你的職責是永遠將安撫情緒和給予同理心放在第一位。請保持溫和、有溫度、不帶任何壓迫感的語氣。
    
    重要限制：在你的所有回覆中，絕對不能使用任何粗體標記符號，例如 **、# 或 * 等符號。
    
    當前使用者實際輸入次數: ${conversationCount}。
    對話紀錄：
    ---
    ${conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n')}
    ---
    
    請遵循以下流程：
    
    1. **如果使用者實際輸入次數小於 3 (目前在引導分析階段)：**
       - 回覆結構必須是：[同理心安撫與肯定感受] ||| [溫和的引導與釐清問題]。
       - 回覆格式：[安撫與同理段落] ||| [溫和提問，引導下一個細節]
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須直接跳到解決方案。
       - 回覆格式：[溫和總結] ||| [溫馨互動挑戰內容] ||| [鼓勵與開放式結語]
       
    (請參照挑戰清單並在第二段中詳細說明挑戰內容。清單：情感表達、肢體暖心、共識重建、換位思考。)
    
    你的回覆必須僅包含 AI 建議的內容（不包含任何註解或格式說明）。
    `;

    try {
        if (loadingIndicator) loadingIndicator.classList.remove('hidden');

        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: promptInstruction }] }],
                config: { temperature: 0.7 }
            })
        });

        const data = await response.json();
        
        let aiResponse = "連線失敗，請檢查網路。";
        if (data.candidates && data.candidates.length > 0) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `API 錯誤：${data.error.message}`;
        }
        
        // 寫入資料庫，讓所有人看到 AI 回覆
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        for (const part of responseParts) {
             await sendToDatabase(part, 'AI', 'Re:Family 智能助手', currentRoomId);
             await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬打字間隔
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
    }
}


// --- 5. 事件監聽與啟動 ---

window.onload = function() {
    // 檢查是否有存儲的暱稱和房間 ID，如果有則跳過 Room Entry Screen
    if (currentUserName && currentRoomId) {
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
         // 確保 Room Entry Screen 顯示
         roomEntryScreen.style.display = 'flex';
         document.getElementById('startChatButton').addEventListener('click', handleRoomEntry);
    }
};

function handleRoomEntry() {
    const roomId = roomIdInput.value.trim();
    const userName = userNameInput.value.trim();

    if (!roomId || !userName) {
        alert("請輸入有效的房間代碼和暱稱！");
        return;
    }

    // 儲存資訊
    currentRoomId = roomId;
    currentUserName = userName;
    localStorage.setItem('chatRoomId', currentRoomId);
    localStorage.setItem('chatUserName', currentUserName);

    // 進入聊天室
    startChatListener(currentRoomId);
    updateUIForChat();
}


// 點擊發送按鈕事件
sendButton.addEventListener('click', () => {
    if (currentRoomId && currentUserName) {
        const userText = userInput.value.trim();
        if (userText) {
            sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
            userInput.value = '';
        }
    }
});

// 按下 Enter 鍵發送事件
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        if (currentRoomId && currentUserName) {
            const userText = userInput.value.trim();
            if (userText) {
                sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
                userInput.value = '';
            }
        }
    }
});
