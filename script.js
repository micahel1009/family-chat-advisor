// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
const API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// 全域變數：用於追蹤對話歷史和計數器
let conversationHistory = [];
let conversationCount = 0; // 對話計數器，達到 3 次後觸發大冒險

// 顯示訊息到聊天室 (已整合 Tailwind 樣式)
function displayMessage(content, type) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // --- START OF TAILWIND STYLING ---
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
        // 系統訊息：模擬群聊發言，靠左對齊
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
    
    messageBubble.innerText = content.trim(); 
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}
// --- END OF TAILWIND STYLING ---


async function sendMessage() {
    const userText = userInput.value.trim();
    if (userText === '') return; 

    displayMessage(userText, 'user');
    userInput.value = '';

    sendButton.disabled = true; 
    userInput.disabled = true;
    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden');
    }

    // 更新對話歷史
    conversationHistory.push({ role: "user", text: userText });
    conversationCount++;

    // 核心 AI 提示語 (Prompt) - 包含新的角色設定和流程控制
    const currentHistory = conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n');
    
    let promptInstruction = `
    你現在是**聊聊小幫手**家庭溝通調解員，你必須保持客觀冷靜，並以「法官」的語氣和角度來分析溝通情境。
    
    當前對話次數 (User Input 次數，不含開場): ${conversationCount}。
    對話紀錄：
    ---
    ${currentHistory}
    ---
    
    請遵循以下流程：
    
    1. **如果對話次數小於 3 (目前在分析階段)：**
       - 你的回覆必須非常客觀、中立，分析當前情境中「雙方的立場與溝通盲點」。
       - 回覆必須分成 2 個簡短段落，模擬分段發送。
       - **回覆格式：[客觀分析段落 1] ||| [客觀分析段落 2]**
       - 你需要提出下一個「提問」，引導使用者提供更多資訊。
       
    2. **如果對話次數大於等於 3 (轉折與大冒險)：**
       - 你的回覆必須**直接跳到解決方案**。
       - 你的回覆必須分成 3 個段落，並使用 \`|||\` 分隔。
       - **段落 1 (轉折)：** 總結調解過程，說明問題的核心已經明確。
       - **段落 2 (提出大冒險)：** 說明現在需要一個溫馨的「大冒險」來化解僵局，並詳細說明大冒險的具體內容 (例如：擁抱、說出感謝的話)。
       - **段落 3 (總結)：** 鼓勵使用者去執行，並結束這次對話。
       - **回覆格式：[總結轉折] ||| [大冒險挑戰內容] ||| [溫馨結語]**
       
    你的回覆必須僅包含 AI 建議的內容（不包含任何註解或格式說明）。
    `;

    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: promptInstruction }]
        }],
        generationConfig: { 
            temperature: 0.8 
        }
    };

    let aiResponse = "連線失敗，無法取得回覆。";

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
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
        
        // 核心修改區塊：分割並依序顯示每個段落
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        
        if (responseParts.length > 0) {
            for (const part of responseParts) {
                await new Promise(resolve => setTimeout(resolve, 500)); // 模擬 0.5 秒的打字延遲
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
