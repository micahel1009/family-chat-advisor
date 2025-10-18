// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
const API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

// 取得 DOM 元素
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// 顯示訊息到聊天室 - 核心修改：創建 Tailwind 風格的氣泡
function displayMessage(content, type) {
    const messageContainer = document.createElement('div');
    const messageBubble = document.createElement('div');
    
    // 設置外層容器的佈局：用戶訊息靠右，系統訊息靠左
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4'); 
    
    if (type === 'user') {
        // 使用者訊息：靠右對齊
        messageContainer.classList.add('justify-end');
        
        // 氣泡樣式：使用框架的暖色漸層 (暖橙 to 暖桃)，圓角只在右邊角收斂
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-warm-orange', 'to-warm-peach', 
            'p-4', 'rounded-2xl', 'rounded-tr-none', 'max-w-md', 'text-white'
        );
        
        // 加入使用者圖標
        const userIcon = document.createElement('div');
        userIcon.classList.add('w-8', 'h-8', 'bg-gray-300', 'dark:bg-gray-600', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        userIcon.innerHTML = '<i class="fas fa-user text-gray-600 dark:text-gray-300 text-xs"></i>';
        
        messageContainer.appendChild(messageBubble);
        messageContainer.appendChild(userIcon);
        
    } else {
        // 系統訊息：靠左對齊
        // 氣泡樣式：使用框架的柔和淺色 (橙 50 to 粉紅 50)，圓角只在左邊角收斂
        messageBubble.classList.add(
            'bg-gradient-to-r', 'from-orange-50', 'to-pink-50', 
            'dark:from-gray-700', 'dark:to-gray-600', 'p-4', 
            'rounded-2xl', 'rounded-tl-none', 'max-w-md', 'text-gray-800', 'dark:text-gray-200'
        );
        
        // 加入 AI 顧問圖標
        const aiIcon = document.createElement('div');
        aiIcon.classList.add('w-8', 'h-8', 'bg-gradient-to-br', 'from-warm-orange', 'to-warm-peach', 'rounded-full', 'flex', 'items-center', 'justify-center', 'flex-shrink-0');
        aiIcon.innerHTML = '<i class="fas fa-heart text-white text-xs"></i>';
        
        messageContainer.appendChild(aiIcon);
        messageContainer.appendChild(messageBubble);
    }
    
    // 將內容放入氣泡
    messageBubble.innerText = content.trim(); 
    
    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}


async function sendMessage() {
    const userText = userInput.value.trim();
    if (userText === '') return; 

    displayMessage(userText, 'user');
    userInput.value = '';

    sendButton.disabled = true; 
    userInput.disabled = true;
    
    // 顯示讀取提示
    if (loadingIndicator) {
        loadingIndicator.classList.remove('hidden'); // Tailwind 類別：移除 hidden
    }

    // 核心修改區塊：AI 提示語，要求使用特殊標記 |||
    const fullPrompt = `你是一位溫暖、簡潔、有同理心，且像朋友一樣的家庭溝通顧問 AI。你的目標是提供像真人對話般的關心與建議，避免冗長和制式化的回覆。請將你的回覆分為三個部分：
1. **溫暖的安慰** (用像朋友對話的語氣，簡短地肯定對方的感受，字數不超過 70 字)。
2. **分析與建議** (提出 1-2 個溫和、簡潔、可操作的溝通或自我照顧方法，字數不超過 80 字)。
3. **結語/鼓勵** (用一句話結束)。
請使用**繁體中文**，並在**每個部分結束後**，使用**特殊符號 \`|||\` **進行區隔（共使用兩次 \`|||\` ），且**不要**在回覆中加入標題、數字或粗體字。情境："${userText}"`;
    
    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        generationConfig: { 
            temperature: 0.7 
        }
    };

    let aiResponse = "很抱歉，無法取得回覆。請檢查 API 金鑰是否正確。";

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
    } finally {
        sendButton.disabled = false;
        userInput.disabled = false;
        if (loadingIndicator) {
            loadingIndicator.classList.add('hidden'); // Tailwind 類別：隱藏 loading 提示
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
