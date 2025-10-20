// 🚨 替換成您在 Google AI Studio 取得的 Gemini API 金鑰 🚨
const GEMINI_API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const authButton = document.getElementById('authButton');

// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; 

// --- AUTHENTICATION FUNCTIONS (保持不變) ---

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
            // ⭐️ 修正區塊：登入成功後的三段式安撫與引導
            // ==============================================================
            authButton.innerText = `登出 (${user.displayName.split(' ')[0]})`; 
            authButton.onclick = signOutUser;
            userInput.placeholder = "輸入您的情境...";
            sendButton.disabled = false;
            
            if (chatArea.children.length === 0 || chatArea.children.length === 1 && chatArea.children[0].id === 'loadingIndicator') {
                chatArea.innerHTML = ''; 
                const userName = user.displayName.split(' ')[0];
                
                // 第一段：安撫情緒與同理心（最重要）
                displayMessage(`歡迎回來，${userName}！能再次看到您，我感到很溫暖。我知道您現在的心情一定很複雜，請先深呼吸。`, 'system');
                
                // 第二段：給予空間與柔性引導（1.5秒後發送）
                setTimeout(() => {
                    displayMessage(`這裡是一個完全屬於您的安全空間，不需要著急。當您準備好時，隨時都可以告訴我：**最近發生了什麼，或是什麼事情讓您感到特別不舒服？**`, 'system');
                }, 1500); 
                
                // 第三段：提醒最終目標（3秒後發送）
                setTimeout(() => {
                    displayMessage(`請記住，我們的最終目標是找到一個溫馨的互動挑戰（類似大冒險），來幫助您化解這次的矛盾。我會全程陪伴您。`, 'system');
                }, 3000); 
            }
            // ==============================================================

        } else {
            // 未登入 (保持不變)
            authButton.innerText = "使用 Gmail 登入";
            authButton.onclick = signInWithGoogle;
            userInput.placeholder = "請先登入才能開始對話。";
            sendButton.disabled = true;
            
            conversationHistory = [];
            conversationCount = 0;
            
            chatArea.innerHTML = '';
            displayMessage(`你好！為了給您創造一個**絕對安全且私密的聊聊空間**，我們需要您簡單登入。
請點擊首頁畫面上的「使用 Gmail 登入」按鈕，我們在這裡等您，隨時準備傾聽您的心事。`, 'system');
        }
    });
}


// --- CHAT FUNCTIONS (保持不變) ---

function displayMessage(content, type) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // --- Tailwind 樣式代碼 ---
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    if (type === 'user') {
        messageContainer.classList.add('justify-end');
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = '<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>';
        
        messageContainer.appendChild(messageBubble);
        messageContainer.appendChild(userIcon);
        
    } else {
        messageContainer.classList.remove('space-x-3');
        messageContainer.classList.add('space-x-3');
        
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        aiIcon.innerHTML = '<i class="fas fa-heart text-white text-xs"></i>';
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    messageBubble.innerHTML = content.trim().replace(/\n/g, '<br>');
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
    
    // 核心 AI 提示語 (Prompt) - 保持最終客觀分析邏輯
    let promptInstruction = `
    你現在是**聊聊小幫手**家庭溝通調解員。你的職責是**絕對客觀、中立地分析**使用者輸入的情境，並提供具體的分析結果。請使用中性、溫和但精確的語言進行描述，不要使用「本庭審酌」、「當事人」、「判決」等法律或過度生硬的詞彙。
    
    當前對話次數 (User Input 次數，不含開場): ${conversationCount}。
    對話紀錄：
    ---
    ${currentHistory}
    ---
    
    請遵循以下流程：
    
    1. **如果對話次數小於 3 (目前在分析階段)：**
       - **回覆內容必須是高度客觀的，像一份簡潔的分析報告。** 釐清當前情境中「雙方的核心訴求、潛在的溝通盲點和未達成共識的領域」。
       - 回覆必須分成 2 個簡短段落，模擬分段發送。
       - **回覆格式：[客觀分析段落 1] ||| [客觀分析段落 2：提出下一個待釐清的問題]**
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須**直接跳到解決方案**。
       - 你的回覆必須分成 3 個段落，並使用 \`|||\` 分隔。
       - **段落 1 (總結)：** 根據前面的客觀分析，簡要總結本次釐清的核心結論。
       - **段落 2 (提出大冒險/互動挑戰)：** 說明現在需要一個溫馨的「互動挑戰」來緩解僵局。請從以下清單中**隨機挑選一項**，並詳細說明如何執行，以針對性地化解本次矛盾：
            * **挑戰 A (情感表達)：** 讓使用者向對方說出三句具體的感謝或肯定對方優點的話。
            * **挑戰 B (肢體暖心)：** 讓使用者給予對方一個溫暖的、長度超過五秒的擁抱，或輕輕拍對方的背部，表達無聲的支持。
            * **挑戰 C (共識重建)：** 邀請使用者與對方共同完成一件 15 分鐘內的簡單家務或共同活動，並在過程中只專注於合作，不談論矛盾。
            * **挑戰 D (換位思考)：** 讓使用者寫下對方在本次矛盾中的三個真實感受，然後與對方交換閱讀並確認。
       - **段落 3 (鼓勵與開放式結語)：** 提供溫暖的鼓勵與支持，讓使用者知道他們隨時可以回來分享結果或討論後續的感受與困難，保持對話的開放性。不要使用任何表達服務「結束」或「到此為止」的詞彙。
       - **回覆格式：[總結結論] ||| [溫馨互動挑戰內容] ||| [鼓勵與開放式結語]**
       
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
                displayMessage(part, 'system');
            }
        } else {
             displayMessage(aiResponse, 'system');
        }
        
    } catch (error) {
        console.error("Fetch Error:", error);
        displayMessage("發生連線錯誤，請檢查您的網路或重新整理頁面。", 'system');
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

// 事件監聽器 (保持不變)
sendButton.addEventListener('click', sendMessage);

userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        sendMessage();
    }
});
