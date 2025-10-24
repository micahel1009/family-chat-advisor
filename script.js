// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
// ！！！ 重要：在最終部署時，應將此金鑰移至 Firebase Functions 以保護安全 ！！！
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const authButton = document.getElementById('authButton');

// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; 
let lastMessageTime = 0; // 用於控制 AI 回覆的頻率

// 獲取 Firestore 實例 (已在 index.html 初始化)
const db = typeof firebase !== 'undefined' && firebase.firestore ? firebase.firestore() : null;
const CHAT_COLLECTION = 'family_chat_room'; // 聊天室的集合名稱


// --- AUTHENTICATION FUNCTIONS ---

function signInWithGoogle() {
    if (!firebase || !firebase.auth) {
         displayMessage("Firebase 認證服務未載入。請檢查 index.html 中的 Firebase SDK 配置。", 'system');
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

// 監聽登入狀態的變化
if (typeof firebase !== 'undefined' && firebase.auth) {
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            // ==============================================================
            // ⭐️ 登入成功：啟用功能並安撫歡迎
            // ==============================================================
            authButton.innerText = `登出 (${user.displayName.split(' ')[0]})`; 
            authButton.onclick = signOutUser;
            userInput.placeholder = "輸入您的情境...";
            sendButton.disabled = false;
            userInput.disabled = false;
            
            // 由於我們移除了群聊邏輯，這裡恢復為單人聊天模式的歡迎邏輯
            if (chatArea.children.length === 0 || chatArea.children.length === 1 && chatArea.children[0].id === 'loadingIndicator') {
                chatArea.innerHTML = ''; 
                const userName = user.displayName.split(' ')[0];
                
                // 第一段：溫暖歡迎與安撫情緒
                displayMessage(`歡迎回來，${userName}！我感受得到您心裡承載著一些重量，請先深呼吸。`, 'system');
                
                // 第二段：給予空間與柔性引導（1.5秒後發送）
                setTimeout(() => {
                    displayMessage(`這裡絕對安全。當您準備好時，隨時都可以告訴我：是什麼事情讓您感到不舒服，或是最近發生了什麼？`, 'system');
                }, 1500); 
                
                // 重置計數器
                conversationCount = 0;
                conversationHistory = [];
            }

        } else {
            // ==============================================================
            // ⭐️ 未登入：禁用功能並溫柔提示
            // ==============================================================
            authButton.innerText = "使用 Gmail 登入";
            authButton.onclick = signInWithGoogle;
            userInput.placeholder = "請先登入才能開始對話。";
            sendButton.disabled = true;
            userInput.disabled = true; // 禁用輸入框
            
            conversationHistory = [];
            conversationCount = 0;
            
            chatArea.innerHTML = '';
            
            // 溫和且分段的未登入提示 (無粗體)
            displayMessage(`你好！在我們開始聊心事之前，我想先給您一個承諾：這裡是一個完全私密且只屬於您的空間。`, 'system');
            setTimeout(() => {
                 displayMessage(`為了確保您的心事不會被別人看到，需要您點擊首頁畫面上的「使用 Gmail 登入」按鈕。我們在這裡等您，隨時準備傾聽您的心事。`, 'system');
            }, 2000);
            // ==============================================================
        }
    });
}


// --- CHAT FUNCTIONS (單人模式，保持安撫優先的 Prompt) ---

function displayMessage(content, type, senderName, timestamp) {
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
        
        // 只有 AI 回覆時顯示名字
        messageBubble.innerHTML = `<strong>Re:Family 智能助手</strong><br>` + cleanedContent;
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


async function sendMessage() {
    if (!firebase.auth().currentUser) {
        displayMessage("您尚未登入，請先登入才能開始對話。", 'system');
        return;
    }
    
    const userText = userInput.value.trim();
    if (userText === '') return; 

    displayMessage(userText, 'user');
    userInput.value = '';

    sendButton.disabled = true; 
    userInput.disabled = true;
    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
    }

    conversationHistory.push({ role: "user", text: userText });
    conversationCount++;

    const currentHistory = conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n');
    
    // 核心 AI 提示語 (Prompt) - 保持安撫優先邏輯
    let promptInstruction = `
    你現在是**Re:Family**家庭溝通引導者。你的職責是**永遠將安撫情緒和給予同理心放在第一位**。請保持溫和、有溫度、不帶任何壓迫感的語氣。
    
    **重要限制：在你的所有回覆中，絕對不能使用任何粗體標記符號，例如 **、# 或 * 等符號。**
    
    當前使用者實際輸入次數: ${conversationCount}。
    對話紀錄：
    ---
    ${currentHistory}
    ---
    
    請遵循以下流程：
    
    1. **如果使用者實際輸入次數小於 3 (目前在引導分析階段)：**
       - **回覆結構必須是：[同理心安撫與肯定感受] ||| [溫和的引導與釐清問題]**。
       - **回覆內容**：嚴禁使用「客觀分析」、「釐清」、「訴求」或「當事人」等生硬詞彙。
       - **安撫段落：** 必須針對使用者描述的情緒（例如「很累」、「生氣」、「不知道怎麼辦」）給予肯定和安慰。
       - **提問段落：** 必須使用柔和的詞語，如「我們可以一起來看看」、「想請您多說一點」來引導使用者提供細節。
       - **回覆格式：[安撫與同理段落] ||| [溫和提問，引導下一個細節]**
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須**直接跳到解決方案**。
       - 你的回覆必須分成 3 個段落，並使用 \`|||\` 分隔。
       - **段落 1 (總結)：** 溫和地總結你們共同釐清的核心，表達對使用者的支持和肯定。
       - **段落 2 (提出大冒險/互動挑戰)：** 說明現在是時候透過一個溫馨的「互動挑戰」來緩和情緒。請從以下清單中**隨機挑選一項**，並詳細說明如何執行，以針對性地化解本次矛盾：
            * **挑戰 A (情感表達)：** 讓使用者向對方說出三句具體的感謝或肯定對方優點的話。
            * **挑戰 B (肢體暖心)：** 讓使用者給予對方一個溫暖的、長度超過五秒的擁抱，或輕輕拍對方的背部，表達無聲的支持。
            * **挑戰 C (共識重建)：** 邀請使用者與對方共同完成一件 15 分鐘內的簡單家務或共同活動，並在過程中只專注於合作，不談論矛盾。
            * **挑戰 D (換位思考)：** 讓使用者寫下對方在本次矛盾中的三個真實感受，然後與對方交換閱讀並確認。
       - **段落 3 (鼓勵與開放式結語)：** 提供溫暖的鼓勵與支持，讓使用者知道他們隨時可以回來分享結果或討論後續的感受與困難，保持對話的開放性。不要使用任何表達服務「結束」或「到此為止」的詞彙。
       - **回覆格式：[溫和總結] ||| [溫馨互動挑戰內容] ||| [鼓勵與開放式結語]**
       
    你的回覆必須僅包含 AI 建議的內容（不包含任何註解或格式說明）。
    `;

    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: promptInstruction }]
        }],
        generationConfig: { 
            temperature: 0.7 
        }
    };

    let aiResponse = "連線失敗，無法取得回覆。";

    try {
        // 🚨 這是前端直接呼叫 Gemini API 的方式 🚨
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `API 錯誤：無法完成請求。錯誤訊息：${data.error.message}`;
             conversationHistory.pop();
             conversationCount--;
        }
        
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        
        if (responseParts.length > 0) {
            for (const part of responseParts) {
                await new Promise(resolve => setTimeout(resolve, 500)); 
                displayMessage(part, 'system', 'Re:Family 智能助手');
            }
        } else {
             displayMessage(aiResponse, 'system', 'Re:Family 智能助手');
        }
        
    } catch (error) {
        console.error("Fetch Error:", error);
        displayMessage("發生連線錯誤，請檢查您的網路或重新整理頁面。", 'system', '系統');
        conversationHistory.pop();
        conversationCount--;
    } finally {
        sendButton.disabled = false;
        userInput.disabled = false;
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden');
        }
        userInput.focus(); 
    }
}

// 首次載入頁面時顯示 AI 歡迎語
function displayInitialWelcomeMessage() {
    const welcomeText = `你好！這裡是一個完全私密且只屬於您的空間。

我很樂意在這裡傾聽您的心事。請告訴我，今天有什麼讓您感到困擾，或者您想分享些什麼呢？`;
    displayMessage(welcomeText, 'system', 'Re:Family 智能助手');
}


// --- 事件監聽與狀態管理 (修改為個人對話模式) ---

sendButton.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        sendMessage();
    }
});

// 頁面載入完成後立即顯示歡迎語
window.onload = displayInitialWelcomeMessage;

// 移除 Firebase onAuthStateChanged 邏輯，避免干擾
// 確保您已在 index.html 中移除了 authButton
