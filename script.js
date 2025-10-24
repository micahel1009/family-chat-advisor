// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const authButton = document.getElementById('authButton');

// 獲取 Firestore 實例 (依賴 index.html 中的初始化)
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const CHAT_COLLECTION = 'family_chat_room'; // 聊天室的集合名稱

// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; 
let lastMessageTime = 0; 


// --- AUTHENTICATION FUNCTIONS ---

function signInWithGoogle() {
    if (!firebase || !firebase.auth) {
         displayMessage("Firebase 認證服務未載入。請檢查 index.html 中的 Firebase SDK 配置。", 'system', '系統');
         return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    firebase.auth().signInWithPopup(provider)
        .catch((error) => {
            console.error("Google 登入錯誤:", error.message);
            alert("登入失敗: " + error.message);
        });
}

function signOutUser() {
    firebase.auth().signOut();
}


// --- DISPLAY MESSAGE LOGIC (與 index.html 樣式匹配) ---

function displayMessage(content, type, senderName) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // 清理所有 * 符號
    const cleanedContent = content.trim().replace(/\*/g, '').replace(/\n/g, '<br>'); 

    // --- Tailwind 樣式代碼 ---
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    if (type === 'user') {
        // 使用者訊息 (靠右)
        messageContainer.classList.add('justify-end');
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = '<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>';
        
        messageBubble.innerHTML = cleanedContent;
        
        messageContainer.appendChild(messageBubble);
        messageContainer.appendChild(userIcon);
        
    } else {
        // 系統/AI 訊息 (靠左)
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        aiIcon.innerHTML = '<i class="fas fa-heart text-white text-xs"></i>';
        
        // AI 回覆時加上名字
        if (senderName === 'Re:Family 智能助手') {
             messageBubble.innerHTML = `<strong>Re:Family 智能助手</strong><br>` + cleanedContent;
        } else {
             messageBubble.innerHTML = cleanedContent; // 其他用戶或系統訊息
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
function startChatListener(userId) {
    if (!db) return;

    db.collection(CHAT_COLLECTION).orderBy('timestamp').onSnapshot(snapshot => {
        if (loadingIndicator) loadingIndicator.classList.add('hidden');
        
        snapshot.docChanges().forEach(change => {
            if (change.type === 'added') {
                const message = change.doc.data();
                const messageId = change.doc.id;

                if (!displayedMessageIds.has(messageId)) {
                    displayedMessageIds.add(messageId);
                    
                    const messageType = message.senderId === 'AI' ? 'system' : (message.senderId === userId ? 'user' : 'other');
                    const senderDisplayName = message.senderId === 'AI' ? 'Re:Family 智能助手' : message.senderName;

                    // 渲染到聊天室
                    displayMessage(message.text, messageType, senderDisplayName, message.timestamp);

                    // 🌟 觸發 AI 法官判斷 (只有非 AI 發送的訊息才觸發) 🌟
                    if (message.senderId !== 'AI') {
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

    // 清空聊天室，如果顯示的是登入提示
    if (chatArea.children.length > 0 && chatArea.children[0].textContent.includes("你好！在我們開始聊心事之前")) {
         chatArea.innerHTML = '';
    }

    await db.collection(CHAT_COLLECTION).add({
        text: text,
        senderId: senderId,
        senderName: senderName,
        timestamp: Date.now()
    }).catch(error => {
        console.error("寫入資料庫失敗:", error);
        displayMessage("🚨 系統錯誤：訊息未能送出。請檢查 Firebase Firestore 設定。", 'system', '系統');
    });
}


// 🌟 核心功能：AI 法官邏輯判斷 🌟
async function checkAndTriggerAI(lastUserMessage) {
    // 重新載入對話歷史 (僅最近的幾條)
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
    
    // 更新次數
    let userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    conversationCount = userMessageCount;
    
    // 檢查是否達到 AI 回覆的條件 (這裡使用簡單的頻率控制)
    const currentTime = Date.now();
    if (currentTime - lastMessageTime < 5000) {
        return; // 5 秒內不重複觸發 AI
    }
    lastMessageTime = currentTime;

    // 觸發 AI 判斷
    await triggerAIPrompt(lastUserMessage.text);
}


// 🌟 核心功能：呼叫 Gemini API 🌟
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
       - 回覆內容：嚴禁使用「客觀分析」、「釐清」、「訴求」或「當事人」等生硬詞彙。
       - 安撫段落：必須針對使用者描述的情緒（例如「很累」、「生氣」、「不知道怎麼辦」）給予肯定和安慰。
       - 提問段落：必須使用柔和的詞語，如「我們可以一起來看看」、「想請您多說一點」來引導使用者提供細節。
       - 回覆格式：[安撫與同理段落] ||| [溫和提問，引導下一個細節]
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須直接跳到解決方案。
       - 你的回覆必須分成 3 個段落，並使用 \`|||\` 分隔。
       - 段落 1 (總結)：溫和地總結你們共同釐清的核心，表達對使用者的支持和肯定。
       - 段落 2 (提出大冒險/互動挑戰)：說明現在是時候透過一個溫馨的「互動挑戰」來緩和情緒。請從以下清單中**隨機挑選一項**，並詳細說明如何執行，以針對性地化解本次矛盾：
            * 挑戰 A (情感表達)：讓使用者向對方說出三句具體的感謝或肯定對方優點的話。
            * 挑戰 B (肢體暖心)：讓使用者給予對方一個溫暖的、長度超過五秒的擁抱，或輕輕拍對方的背部，表達無聲的支持。
            * 挑戰 C (共識重建)：邀請使用者與對方共同完成一件 15 分鐘內的簡單家務或共同活動，並在過程中只專注於合作，不談論矛盾。
            * 挑戰 D (換位思考)：讓使用者寫下對方在本次矛盾中的三個真實感受，然後與對方交換閱讀並確認。
       - 段落 3 (鼓勵與開放式結語)：提供溫暖的鼓勵與支持，讓使用者知道他們隨時可以回來分享結果或討論後續的感受與困難，保持對話的開放性。不要使用任何表達服務「結束」或「到此為止」的詞彙。
       - 回覆格式：[溫和總結] ||| [溫馨互動挑戰內容] ||| [鼓勵與開放式結語]
       
    你的回覆必須僅包含 AI 建議的內容（不包含任何註解或格式說明）。
    `;

    try {
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
             await sendToDatabase(part, 'AI', 'Re:Family 智能助手');
             await new Promise(resolve => setTimeout(resolve, 1000)); // 模擬打字間隔
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
    } finally {
        // 釋放按鈕
        sendButton.disabled = false;
        userInput.disabled = false;
        userInput.focus();
    }
}


// --- 事件監聽與啟動 ---

// 頁面載入完成後立即顯示歡迎語
window.onload = function() {
    // ⭐️ 解決載入狀態卡住問題：立即賦予按鈕點擊事件 ⭐️
    const authButton = document.getElementById('authButton');
    authButton.innerText = "使用 Gmail 登入";
    authButton.onclick = signInWithGoogle; 

    // 🌟 啟動 Firestore 監聽器 (必須放在 onAuthStateChanged 內) 🌟
    if (typeof firebase !== 'undefined' && firebase.auth) {
        firebase.auth().onAuthStateChanged((user) => {
            if (user) {
                // 登入成功：啟動聊天室
                if(db) startChatListener(user.uid);
                
                // 登入後 UI 狀態修正
                const userName = user.displayName.split(' ')[0];
                authButton.innerText = `登出 (${userName})`;
                authButton.onclick = signOutUser;
                userInput.placeholder = "輸入您的情境...";
                sendButton.disabled = false;
                userInput.disabled = false;
                
                // 登入成功，顯示歡迎語
                 const welcomeText = `歡迎回來，${userName}！我感受得到您心裡承載著一些重量，請先深呼吸。`;
                 displayMessage(welcomeText.replace(/\*/g, ''), 'system', 'Re:Family 智能助手');
                 setTimeout(() => {
                    displayMessage(`這裡絕對安全。當您準備好時，隨時都可以告訴我：是什麼事情讓您感到不舒服，或是最近發生了什麼？`, 'system', 'Re:Family 智能助手');
                 }, 1500); 

            } else {
                // 未登入 (禁用功能並顯示提示)
                authButton.innerText = "使用 Gmail 登入";
                authButton.onclick = signInWithGoogle;
                userInput.placeholder = "請先登入才能開始對話。";
                sendButton.disabled = true;
                userInput.disabled = true;
                
                chatArea.innerHTML = '';
                const unauthText = `你好！在我們開始聊心事之前，我想先給您一個承諾：這裡是一個完全私密且只屬於您的空間。

為了確保您的心事不會被別人看到，需要您點擊首頁畫面上的「使用 Gmail 登入」按鈕。我們在這裡等您，隨時準備傾聽您的心事。`;
                 displayMessage(unauthText.replace(/\*/g, ''), 'system', 'Re:Family 智能助手');
            }
        });
    } else {
        // 如果 Firebase SDK 載入失敗的最終保障
        chatArea.innerHTML = '';
        displayMessage("🚨 錯誤：Firebase 服務無法載入。請檢查您的網路或 index.html 配置。", 'system', '系統');
    }
};


// 恢復點擊與 Enter 鍵事件監聽
sendButton.addEventListener('click', () => {
    if (firebase.auth().currentUser) {
        const userText = userInput.value.trim();
        if (userText) {
            sendToDatabase(userText, firebase.auth().currentUser.uid, firebase.auth().currentUser.displayName);
            userInput.value = '';
            sendButton.disabled = true;
            userInput.disabled = true;
        }
    } else {
         displayMessage("請先登入才能發言。", 'system', '系統');
    }
});

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        if (firebase.auth().currentUser) {
            const userText = userInput.value.trim();
            if (userText) {
                sendToDatabase(userText, firebase.auth().currentUser.uid, firebase.auth().currentUser.displayName);
                userInput.value = '';
                sendButton.disabled = true;
                userInput.disabled = true;
            }
        } else {
            displayMessage("請先登入才能發言。", 'system', '系統');
        }
    }
});
