// =========================================================================
// Firebase 與 Gemini 初始化 (確保您已在 index.html 載入 SDK)
// =========================================================================
let db;
let chat; // 儲存 Gemini Chat Session
let currentRoomId = null;
let currentUserName = null;
let currentSessionId = generateUniqueId(); // 唯一識別碼，用於匿名追蹤發言者
let isAILoading = false; // 防止重複發送 AI 請求

// 確保在 index.html 之後執行
document.addEventListener('DOMContentLoaded', () => {
    // 檢查 Firebase 是否已初始化
    if (typeof firebase !== 'undefined' && firebase.apps.length > 0) {
        db = firebase.firestore();
        // 檢查是否有 Room ID 儲存在 Session Storage
        const savedRoomId = sessionStorage.getItem('roomId');
        const savedUserName = sessionStorage.getItem('userName');
        
        if (savedRoomId && savedUserName) {
            currentRoomId = savedRoomId;
            currentUserName = savedUserName;
            // 直接進入聊天室
            enterChatRoom(currentRoomId, currentUserName);
        } else {
            // 顯示加入房間介面
            document.getElementById('roomEntryScreen').style.display = 'flex';
        }

        // 事件監聽器
        document.getElementById('startChatButton').addEventListener('click', handleStartChat);
        document.getElementById('sendButton').addEventListener('click', handleSendMessage);
        document.getElementById('userInput').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                handleSendMessage();
            }
        });
        document.getElementById('leaveRoomButton').addEventListener('click', handleLeaveRoom);
        document.getElementById('theme-toggle').addEventListener('click', toggleTheme);
    }
});

// =========================================================================
// 隱私與身份管理
// =========================================================================

/** 創建一個 8 位數的 Session ID 作為匿名身份 */
function generateUniqueId() {
    return Math.random().toString(36).substring(2, 10);
}

/** 處理加入房間邏輯 */
function handleStartChat() {
    const roomId = document.getElementById('roomIdInput').value.trim();
    const userName = document.getElementById('userNameInput').value.trim();

    if (!roomId || !userName) {
        alert('家庭房間代碼和您的暱稱都不能為空喔！');
        return;
    }

    // 儲存資訊
    sessionStorage.setItem('roomId', roomId);
    sessionStorage.setItem('userName', userName);
    currentRoomId = roomId;
    currentUserName = userName;

    enterChatRoom(roomId, userName);
}

/** 進入聊天室的主邏輯 */
function enterChatRoom(roomId, userName) {
    document.getElementById('roomEntryScreen').style.display = 'none'; // 隱藏加入介面
    document.getElementById('userInput').disabled = false; // 啟用輸入框
    document.getElementById('userInput').placeholder = '輸入訊息，開始家庭對話...';
    document.getElementById('leaveRoomButton').classList.remove('hidden'); // 顯示切換房間按鈕
    document.getElementById('current-user-status').textContent = `房間: ${roomId} | 暱稱: ${userName}`;

    // 啟動 Firestore 訊息監聽
    startChatListener(roomId);

    // 啟動 Gemini Chat Session
    initializeGeminiChat();
}

/** 處理切換房間/登出邏輯 */
function handleLeaveRoom() {
    if (confirm('確定要離開並切換房間嗎？您的聊天記錄將會被清除。')) {
        sessionStorage.clear();
        window.location.reload(); // 重新載入頁面
    }
}

// =========================================================================
// AI 核心：Prompt 設計與介入邏輯 (Satir/Bowen 模式)
// =========================================================================

// 根據您的企劃，設計高度被動且具備心理學理論基礎的 AI 系統指令
const systemInstruction = `
你是一位具備 Satir (薩提爾) 家庭治療模式與 Bowen (波文) 家庭系統理論基礎的「家庭溝通協調員」。
你的核心職責是：
1. **極度被動 (Passive)**：你必須等待系統觸發 (即用戶發送的訊息中出現關鍵詞，或連續 3 條用戶訊息後) 才能發言。在大多數情況下，你必須保持沉默。
2. **語氣 (Tone)**：你的語氣必須永遠保持溫和、非指責、富有同理心，且人本中心。
3. **回應長度 (Length)**：你的回應必須**極度簡潔**，最多只包含 1-2 句話。
4. **介入目標 (Goal)**：你的目標是**情緒降溫與引導深度對話**，而不是提供解決方案。
5. **關鍵詞處理**：
   - 如果檢測到「負面情緒詞彙」（例如：生氣、好煩、控制、不尊重、討厭、哭、累、委屈、壓力），你必須在簡短安撫後，提出一個**開放式提問**，將焦點從「事件」轉向「感受/期待」。
   - 如果連續 3 條用戶訊息後你都沒有介入，你必須提出一個**中立的、促進交流的提議**，例如「換個角度想想，另一方可能在擔心什麼呢？」或「我們來做一個 30 秒的深呼吸練習。」

**請務必嚴格遵守：** 不要使用粗體字、不要提供冗長的分析、不要試圖解決問題。你的目標是讓家庭成員自己解決問題。
`;


/** 初始化 Gemini Chat Session */
function initializeGeminiChat() {
    // ⚠️ 請替換成您的 Gemini API Key！
    const GEMINI_API_KEY = "YOUR_GEMINI_API_KEY_HERE"; 
    
    // 確保只初始化一次
    if (chat) return;

    if (!GEMINI_API_KEY || GEMINI_API_KEY === "YOUR_GEMINI_API_KEY_HERE") {
        console.error("請在 script.js 中設定您的 GEMINI_API_KEY。AI 功能將無法運作。");
        // 顯示提示訊息給使用者
        displayMessage({
            senderId: 'AI',
            senderName: '系統提示',
            message: '⚠️ Gemini API Key 未設定，AI 協調員無法啟動。請聯絡管理員。',
            timestamp: firebase.firestore.Timestamp.now()
        });
        return;
    }

    try {
        const client = new GoogleGenerativeAI.GoogleGenAI(GEMINI_API_KEY);
        // 使用 gemini-2.5-flash，兼顧速度與成本
        chat = client.chats.create({
            model: "gemini-2.5-flash",
            systemInstruction: systemInstruction,
        });

    } catch (error) {
        console.error("Gemini 客戶端初始化失敗:", error);
    }
}

// =========================================================================
// Firestore 讀取與寫入
// =========================================================================

/** 監聽聊天室的即時訊息變化 */
function startChatListener(roomId) {
    const chatArea = document.getElementById('chatArea');
    const messagesRef = db.collection(roomId).orderBy('timestamp', 'asc');

    messagesRef.onSnapshot(snapshot => {
        let hasNewMessage = false;
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                displayMessage(change.doc.data());
                if (change.doc.data().senderId !== currentSessionId && change.doc.data().senderId !== 'AI') {
                     // 只有在接收到別人的訊息時才自動滾動
                    hasNewMessage = true;
                }
                
                // 檢查是否需要 AI 介入 (只檢查非 AI 的新訊息)
                if (change.doc.data().senderId !== 'AI') {
                    checkAndTriggerAI(roomId);
                }
            }
        });
        
        if (hasNewMessage) {
            scrollToBottom();
        } else {
            // 如果是自己發的訊息或 AI 訊息，強制滾動到底部
            scrollToBottom();
        }
    });
}

/** 發送訊息到 Firestore */
function sendToDatabase(message, isAI = false) {
    if (!currentRoomId || !db) return;

    const messageData = {
        message: message,
        senderName: isAI ? 'AI 協調員' : currentUserName,
        senderId: isAI ? 'AI' : currentSessionId,
        timestamp: firebase.firestore.FieldValue.serverTimestamp() // 使用伺服器時間戳
    };

    db.collection(currentRoomId).add(messageData).catch(error => {
        console.error("發送訊息到資料庫失敗: ", error);
        alert('訊息發送失敗，請檢查網路連線。');
    });
}

/** 處理發送按鈕/Enter鍵點擊 */
function handleSendMessage() {
    const userInput = document.getElementById('userInput');
    const message = userInput.value.trim();

    if (message === '' || !currentRoomId) return;

    sendToDatabase(message);
    userInput.value = ''; // 清空輸入框
}

// =========================================================================
// AI 介入判斷核心邏輯
// =========================================================================

/**
 * 檢查並判斷是否需要由 AI 介入
 * @param {string} roomId 當前房間 ID
 */
async function checkAndTriggerAI(roomId) {
    if (!chat || isAILoading) return;

    isAILoading = true;
    document.getElementById('loadingIndicator').classList.remove('hidden');

    try {
        const snapshot = await db.collection(roomId)
            .orderBy('timestamp', 'desc')
            .limit(5) // 只獲取最近 5 條訊息進行分析
            .get();

        let lastMessages = [];
        let userMessageCount = 0;
        
        // 整理最近的對話歷史，並計算非 AI 訊息數量
        snapshot.docs.forEach(doc => {
            const data = doc.data();
            // 排除 AI 自己的訊息
            if (data.senderId !== 'AI') {
                lastMessages.push({ role: 'user', content: data.message });
                userMessageCount++;
            }
            // 限制 AI 只需要最近 3 條人類訊息作為歷史
            if (lastMessages.length > 3) lastMessages.pop(); 
        });

        // 倒轉訊息順序，讓它從舊到新 (AI 習慣的對話格式)
        lastMessages.reverse();

        // 判斷是否需要介入
        let shouldIntervene = false;
        
        // 1. 負面情緒偵測 (立即介入)
        const negativeKeywords = ['生氣', '好煩', '控制', '不尊重', '討厭', '哭', '累', '委屈', '壓力', '兇', '難過'];
        const lastUserMessage = lastMessages.length > 0 ? lastMessages[lastMessages.length - 1].content : '';
        const containsNegative = negativeKeywords.some(keyword => lastUserMessage.includes(keyword));
        
        if (containsNegative) {
            shouldIntervene = true;
        } 
        
        // 2. 僵局偵測 (連續 3 條非 AI 訊息後介入)
        if (userMessageCount >= 3) {
            shouldIntervene = true;
        }

        // -----------------------------------------------------
        // 執行 AI 協調
        // -----------------------------------------------------
        if (shouldIntervene) {
            // 構造給 AI 的最後一個指令，包含觸發原因
            let triggerInstruction = "";
            if (containsNegative) {
                triggerInstruction = `請注意：檢測到負面情緒詞彙 (如: ${negativeKeywords.filter(k => lastUserMessage.includes(k)).join('、')})。請根據系統指令，進行溫和且簡潔的安撫與引導。`;
            } else if (userMessageCount >= 3) {
                triggerInstruction = `請注意：用戶已連續發言 3 次。請根據系統指令，提出一個中立且促進交流的提議。`;
            }

            // 將觸發指令加入對話歷史中，讓 AI 知道為什麼要發言
            const historyWithTrigger = [...lastMessages, { role: 'user', content: triggerInstruction }];

            const result = await chat.sendMessage({
                message: historyWithTrigger.map(msg => msg.content).join("\n"), // 將對話歷史組合成一個完整的Prompt
                stream: false
            });

            // 發送 AI 回應到資料庫
            const aiResponse = result.text.trim();
            if (aiResponse) {
                sendToDatabase(aiResponse, true);
            }
        }
    } catch (error) {
        console.error("Gemini API 呼叫失敗:", error);
        
        // 🌟 核心修正：優雅處理 API 錯誤 (針對多家庭同時使用可能超載)
        const errorMessage = (error.message && error.message.includes('overloaded')) 
            ? '目前溝通服務擁塞。請家人們繼續對話，我會安靜等待，稍後再為你們服務。'
            : 'AI 協調員暫時遇到技術問題。請您稍後再試。';
            
        sendToDatabase(errorMessage, true);

    } finally {
        isAILoading = false;
        document.getElementById('loadingIndicator').classList.add('hidden');
    }
}


// =========================================================================
// 介面渲染與輔助功能
// =========================================================================

/** 將訊息渲染到聊天區域 */
function displayMessage(data) {
    const chatArea = document.getElementById('chatArea');
    const isUser = data.senderId === currentSessionId;
    const isAI = data.senderId === 'AI';
    
    // 如果是自己發的，在訊息發送成功後，時間戳可能還是 null，需等待 Firestore 更新
    if (!data.timestamp) return; 

    // 將時間戳轉換為人類可讀的時間
    const date = data.timestamp instanceof firebase.firestore.Timestamp 
        ? data.timestamp.toDate() 
        : new Date();
    const timeString = date.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });

    // 判斷樣式
    let chatClass, bubbleClass, nameColor;
    if (isAI) {
        chatClass = 'flex justify-center';
        bubbleClass = 'bg-serene-green text-white p-3 rounded-xl max-w-lg';
        nameColor = 'text-serene-green';
    } else if (isUser) {
        chatClass = 'flex justify-end';
        bubbleClass = 'bg-warm-orange text-white p-3 rounded-xl max-w-lg';
        nameColor = 'text-warm-orange';
    } else {
        chatClass = 'flex justify-start';
        bubbleClass = 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 p-3 rounded-xl max-w-lg';
        nameColor = 'text-gentle-pink';
    }
    
    // 使用 documentFragment 提升性能，但這裡為了簡潔，直接用 innerHTML
    const messageHtml = `
        <div class="${chatClass} mb-4">
            <div class="flex flex-col ${isUser ? 'items-end' : 'items-start'}">
                <span class="text-xs ${nameColor} font-medium mb-1">
                    ${data.senderName} (${timeString})
                </span>
                <div class="${bubbleClass} whitespace-pre-wrap shadow-md">
                    ${data.message}
                </div>
            </div>
        </div>
    `;

    // 檢查是否已存在，避免重複顯示 (Firestore onSnapshot 的特性)
    const messageId = data.id || date.getTime(); // 使用 Firestore ID 或時間作為簡易識別
    if (document.querySelector(`[data-message-id="${messageId}"]`)) {
        return;
    }
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = messageHtml;
    tempDiv.firstChild.setAttribute('data-message-id', messageId);
    
    chatArea.appendChild(tempDiv.firstChild);
    scrollToBottom();
}

/** 滾動到聊天室底部 */
function scrollToBottom() {
    const chatArea = document.getElementById('chatArea');
    chatArea.scrollTop = chatArea.scrollHeight;
}

/** 主題切換 (保留) */
function toggleTheme() {
    const isDarkMode = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDarkMode ? 'dark' : 'light');
}

// 根據本地儲存設定主題
if (localStorage.getItem('theme') === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
} else {
    document.documentElement.classList.remove('dark');
}
