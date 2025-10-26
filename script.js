// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

// --- 1. DOM 元素獲取 ---
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const authButton = document.getElementById('authButton');

// 獲取 Firebase 實例
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const CHAT_COLLECTION = 'family_chat_room'; 

// 全域變數
let conversationHistory = [];
let conversationCount = 0; 
let lastMessageTime = 0; 


// --- 2. AUTHENTICATION FUNCTIONS ---

function signInWithGoogle() {
    if (!firebase || !firebase.auth) {
         displayMessage("Firebase 認證服務未載入。請檢查 index.html 中的 Firebase SDK 配置。", 'system', '系統');
         return;
    }
    const provider = new firebase.auth.GoogleAuthProvider();
    
    // ⭐️ 關鍵修正：使用 signInWithRedirect 確保在各平台都能跳轉登入 ⭐️
    firebase.auth().signInWithRedirect(provider)
        .catch((error) => {
            console.error("Google 登入錯誤:", error.message);
            alert("登入失敗: " + error.message);
        });
}

function signOutUser() {
    firebase.auth().signOut();
}

// 監聽登入狀態的變化
if (typeof firebase !== 'undefined' && firebase.auth) {
    
    // ⭐️ 核心：檢查登入重定向的結果 ⭐️
    firebase.auth().getRedirectResult().then((result) => {
        if (result.credential) {
             // 登入成功，onAuthStateChanged 會接管
        }
    }).catch((error) => {
         console.error("Redirect Error:", error.message);
         // 登入失敗，仍會進入未登入狀態
    });


    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // 登入成功
            if(db) startChatListener(user.uid);
            
            // 登入後 UI 狀態修正
            const userName = user.displayName.split(' ')[0];
            authButton.innerText = `登出 (${userName})`;
            authButton.onclick = signOutUser;
            userInput.placeholder = "輸入您的情境...";
            sendButton.disabled = false;
            userInput.disabled = false;
            
            // 登入成功，顯示歡迎語 (只在聊天室為空時顯示)
            if (chatArea.children.length === 0 || chatArea.children.length === 1 && chatArea.children[0].id === 'loadingIndicator') {
                chatArea.innerHTML = ''; 
                
                // 第一段：溫暖歡迎與安撫情緒 (無粗體)
                displayMessage(`歡迎回來，${userName}！我感受得到您心裡承載著一些重量，請先深呼吸。`, 'system', 'Re:Family 智能助手');
                
                // 第二段：給予空間與柔性引導（1.5秒後發送）(無粗體)
                setTimeout(() => {
                    displayMessage(`這裡絕對安全。當您準備好時，隨時都可以告訴我：是什麼事情讓您感到不舒服，或是最近發生了什麼？`, 'system', 'Re:Family 智能助手');
                }, 1500); 
            }

        } else {
            // 未登入 (禁用功能並顯示提示)
            authButton.innerText = "使用 Gmail 登入";
            authButton.onclick = signInWithGoogle;
            userInput.placeholder = "請先登入才能開始對話。";
            sendButton.disabled = true;
            userInput.disabled = true; 
            
            // 顯示未登入提示 (在登入事件中處理，這裡只確保 UI 正確)
            chatArea.innerHTML = '';
            const unauthText = `你好！在我們開始聊心事之前，我想先給您一個承諾：這裡是一個完全私密且只屬於您的空間。

為了確保您的心事不會被別人看到，需要您點擊首頁畫面上的「使用 Gmail 登入」按鈕。我們在這裡等您，隨時準備傾聽您的心事。`;
            displayMessage(unauthText.replace(/\*/g, ''), 'system', 'Re:Family 智能助手');
        }
    });
}


// --- 3. CHAT FUNCTIONS ---

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
        
        messageBubble.innerHTML = cleanedContent;
        
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
        aiIcon.innerHTML = '<i class="fas fa-heart text-white text-xs"></i>';
        
        if (senderName === 'Re:Family 智能助手') {
             messageBubble.innerHTML = `<strong>Re:Family 智能助手</strong><br>` + cleanedContent;
        } else {
             messageBubble.innerHTML = headerHtml + cleanedContent;
        }
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


let displayedMessageIds = new Set(); 

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

                    displayMessage(message.text, messageType, senderDisplayName, message.timestamp);

                    if (message.senderId !== 'AI') {
                        checkAndTriggerAI(message);
                    }
                }
            }
        });
    });
}

async function sendToDatabase(text, senderId, senderName) {
    if (!db || text.trim() === '') return;

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


async function checkAndTriggerAI(lastUserMessage) {
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
    
    let userMessageCount = conversationHistory.filter(m => m.role === 'user').length;
    conversationCount = userMessageCount;
    
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
             await new Promise(resolve => setTimeout(resolve, 1000)); 
        }

    } catch (error) {
        console.error("Gemini API Error:", error);
    } finally {
        // 按鈕釋放在 sendToDatabase 完成後，讓 Firestore 監聽器來處理
    }
}


// --- 事件監聽與啟動 ---

window.onload = function() {
    // ⭐️ 關鍵修正：確保按鈕點擊事件在 DOM 載入後立即生效 ⭐️
    const authButton = document.getElementById('authButton');
    authButton.onclick = signInWithGoogle; 

    // 啟動狀態監聽
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
                chatArea.innerHTML = '';
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
