// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
const API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

// 取得 DOM 元素 (略)
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator'); 

// 顯示訊息到聊天室
function displayMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${type}-message`);
    messageDiv.innerHTML = content.replace(/\n/g, '<br>'); 
    chatArea.appendChild(messageDiv);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 處理發送訊息的核心函式
async function sendMessage() {
    const userText = userInput.value.trim();
    if (userText === '') return; 

    displayMessage(userText, 'user');
    userInput.value = '';

    sendButton.disabled = true; 
    userInput.disabled = true;
    if (loadingIndicator) {
        loadingIndicator.classList.add('visible');
    }

    // ******************************************************
    // *** 核心修改區塊：優化 AI 提示語 (Prompt) ***
    // ******************************************************
    const fullPrompt = `你是一位溫暖、簡潔、有同理心，且像朋友一樣的家庭溝通顧問 AI。你的目標是提供像真人對話般的關心與建議，避免冗長和制式化的回覆。請將你的回覆分為兩到三段，每段文字內容**不要超過 80 個字**。

請針對使用者描述的家庭情境，提供以下回應：
1. **溫暖的回應（同理與安慰）：** 用像朋友對話的語氣，肯定對方的感受，且字數要少，像真人在簡訊中表達關心。
2. **具體的下一步建議：** 提出 1-2 個溫和、簡潔、可操作的溝通或自我照顧方法。
請使用繁體中文，回覆時請不要使用標題（例如：1.、2. 或粗體字），只用換行隔開你的不同段落，以模擬真實對話中分段傳送訊息的感覺。情境："${userText}"`;
    // ******************************************************
    
    // API 呼叫結構 (保持不變)
    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        generationConfig: { 
            temperature: 0.7 
        }
    };

    try {
        // 呼叫 Gemini API (保持不變)
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        let aiResponse = "很抱歉，無法取得回覆。請檢查 API 金鑰是否正確。";
        
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `**API 錯誤**：無法完成請求。錯誤訊息：${data.error.message}`;
        }

        displayMessage(aiResponse, 'system');

    } catch (error) {
        console.error("Fetch Error:", error);
        displayMessage("發生連線錯誤，請檢查您的網路或重新整理頁面。", 'system');
    } finally {
        sendButton.disabled = false;
        userInput.disabled = false;
        if (loadingIndicator) {
            loadingIndicator.classList.remove('visible');
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
