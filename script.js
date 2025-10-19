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
    
    // --- START OF TAILWIND STYLING (與之前版本保持一致) ---
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

    const currentHistory = conversationHistory.map(item => `${item.role}: ${item.text}`).join('\n');
    
    // 修正：移除所有生硬的法律術語，改用中性詞彙
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
       - **段落 2 (提出大冒險)：** 說明現在需要一個溫馨的「互動挑戰」來緩解僵局，並詳細說明大冒險的具體內容 (例如：擁抱、說出感謝的話)。
       - **段落 3 (結語)：** 鼓勵使用者去執行，並結束本次調解服務。
       - **回覆格式：[總結結論] ||| [溫馨互動挑戰內容] ||| [調解結束語]**
       
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
