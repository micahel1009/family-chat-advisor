// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const nicknameDisplay = document.getElementById('current-user-name');

// 獲取 Firestore 實例 (依賴 index.html 中的初始化)
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const CHAT_COLLECTION = 'family_chat_room'; // 聊天室的集合名稱

// 全域變數：用於追蹤對話歷史、計數器和身份識別
let conversationHistory = [];
let conversationCount = 0; 
let lastMessageTime = 0; 
let currentUserName = localStorage.getItem('chatUserName') || null; 
// 使用 localStorage 或 Session ID 作為裝置唯一 ID，取代 Firebase UID
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);


// --- 1. UTILITY FUNCTIONS ---

/**
 * 提示使用者輸入或更新暱稱
 */
function getUserName() {
    let name = currentUserName;
    if (!name) {
        name = prompt("請輸入您的暱稱，以便在群聊中識別您的身份：(例如：爸爸、媽媽、小明)");
        
        if (name && name.trim() !== '') {
            currentUserName = name.trim();
            localStorage.setItem('chatUserName', currentUserName);
        } else {
            // 如果使用者取消或輸入空白，使用預設暱稱
            currentUserName = "匿名使用者"; 
            localStorage.setItem('chatUserName', currentUserName);
        }
    }
    nicknameDisplay.textContent = `暱稱：${currentUserName}`;
}


// --- 2. DISPLAY MESSAGE LOGIC ---

function displayMessage(content, type, senderName) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // 清理所有 * 符號
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    if (type === 'user') { // 使用者的訊息，靠右對齊
        messageContainer.classList.add('justify-end');
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = `<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>`;
        
        messageBubble.innerHTML = `<strong>${senderName}</strong><br>` + cleanedContent;
        messageContainer.appendChild(messageBubble);
        messageContainer.appendChild(userIcon);
        
    } else { // AI 或其他使用者的訊息，靠左對齊
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        
        if (senderName === 'Re:Family 智能助手') {
             aiIcon.innerHTML = '<i class="fas fa-heart text-white text-xs"></i>';
             messageBubble.innerHTML = `<strong>${senderName}</strong><br>` + cleanedContent;
        } else {
             aiIcon.innerHTML = `<i class="fas fa-users text-white text-xs"></i>`; // 其他匿名使用者
             messageBubble.innerHTML = `<strong>${senderName}</strong><br>` + cleanedContent;
        }
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


// 記錄已顯示的訊息 ID，避免重複渲染
let displayedMessageIds = new Set(); 

// 🌟 核心功能：即時監聽 Firestore 資料庫 🌟
function startChatListener() {
    if (!db) return;

    db.collection(CHAT_COLLECTION).orderBy('timestamp').limit(50).onSnapshot(snapshot => {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const message = change.doc.data();
                const messageId = change.doc.id;

                if (!displayedMessageIds.has(messageId)) {
                    displayedMessageIds.add(messageId);
                    
                    const isCurrentUser = message.senderId === sessionId;
                    const messageType = message.senderId === 'AI' ? 'system' : (isCurrentUser ? 'user' : 'other');
                    
                    // 如果是其他使用者或AI的訊息，則顯示
                    displayMessage(message.text, messageType, message.senderName);

                    // 只有當訊息來自當前裝置以外的用戶時，才觸發 AI 判斷
                    if (message.senderId !== 'AI' && isCurrentUser) {
                        checkAndTriggerAI(message);
                    }
                }
            }
        });
    });
}


// 🌟 核心功能：發送訊息到資料庫 🌟
async function sendToDatabase(text, senderId, senderName) {
    if (!db || text.trim() === '') return;
    
    // 如果是第一次發言，清除歡迎訊息
    if (chatArea.children.length > 0 && chatArea.children[0].textContent.includes("這裡絕對安全")) {
         chatArea.innerHTML = '';
    }

    // 禁用輸入，等待發送完成
    sendButton.disabled = true;
    userInput.disabled = true;
    
    await db.collection(CHAT_COLLECTION).add({
        text: text,
        senderId: senderId,
        senderName: senderName,
        timestamp: Date.now()
    }).then(() => {
        // 發送成功後，重新啟用輸入
        sendButton.disabled = false;
        userInput.disabled = false;
    }).catch(error => {
        console.error("寫入資料庫失敗:", error);
        displayMessage("🚨 系統錯誤：訊息未能送出。請檢查 Firebase Firestore 設定和連線。", 'system', '系統');
        sendButton.disabled = false;
        userInput.disabled = false;
    });
}


// 🌟 核心功能：AI 法官邏輯判斷 🌟
async function checkAndTriggerAI(lastUserMessage) {
    // 獲取最新的 10 條訊息作為歷史記錄
    const snapshot = await db.collection(CHAT_COLLECTION)
        .orderBy('timestamp', 'desc')
        .limit(10) 
        .get();

    conversationHistory = [];
    snapshot.docs.reverse().forEach(doc => {
        const data = doc.data();
        const role = data.senderId === 'AI' ? 'model' : 'user'; 
        conversationHistory.push({ role: role, text: data.text });
    });
    
    // 計算使用者實際輸入次數 (不含 AI)
    let userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    conversationCount = userMessageCount;
    
    // 限制 AI 回覆頻率 (5 秒內不重複回覆)
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
        
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        for (const part of responseParts) {
             await sendToDatabase(part, 'AI', 'Re:Family 智能助手');
             await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬打字間隔
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        userInput.focus();
    }
}


// --- 事件監聽與啟動 ---

window.onload = function() {
    getUserName(); // 網頁載入時提示使用者輸入暱稱
    startChatListener(); // 啟動 Firebase Firestore 監聽
    
    // 顯示歡迎語
    chatArea.innerHTML = '';
    const welcomeText = `歡迎您，${currentUserName}！請先深呼吸。`;
    displayMessage(welcomeText, 'system', 'Re:Family 智能助手');
    setTimeout(() => {
       displayMessage(`這裡絕對安全。當您準備好時，隨時都可以告訴我：是什麼事情讓您感到不舒服，或是最近發生了什麼？`, 'system', 'Re:Family 智能助手');
    }, 1500); 
};


// 點擊發送按鈕事件
sendButton.addEventListener('click', () => {
    const userText = userInput.value.trim();
    if (userText) {
        sendToDatabase(userText, sessionId, currentUserName);
        userInput.value = '';
    }
});

// 按下 Enter 鍵發送事件
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        const userText = userInput.value.trim();
        if (userText) {
            sendToDatabase(userText, sessionId, currentUserName);
            userInput.value = '';
        }
    }
});
