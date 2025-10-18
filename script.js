// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
const API_KEY = "AIzaSyA5yEKm4fqDpBE7u7lCRrAtrcGv8pJ67dY"; 

const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// 顯示訊息到聊天室
function displayMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${type}-message`);
    // 確保只顯示文字，不處理內部的換行
    messageDiv.innerText = content.trim(); // 使用 innerText 避免 HTML 標籤問題，並移除前後空格
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
    // *** 核心修改區塊 1：要求 AI 使用特殊標記 ||| ***
    // ******************************************************
    const fullPrompt = `你是一位溫暖、簡潔、有同理心，且像朋友一樣的家庭溝通顧問 AI。你的目標是提供像真人對話般的關心與建議，避免冗長和制式化的回覆。請將你的回覆分為三個部分：
1. **溫暖的安慰** (用像朋友對話的語氣，簡短地肯定對方的感受，字數不超過 70 字)。
2. **分析與建議** (提出 1-2 個溫和、簡潔、可操作的溝通或自我照顧方法，字數不超過 80 字)。
3. **結語/鼓勵** (用一句話結束)。
請使用**繁體中文**，並在**每個部分結束後**，使用**特殊符號 \`|||\` **進行區隔（共使用兩次 \`|||\` ），且**不要**在回覆中加入標題、數字或粗體字。情境："${userText}"`;
    // ******************************************************
    
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
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `**API 錯誤**：無法完成請求。錯誤訊息：${data.error.message}`;
        }
        
        // ******************************************************
        // *** 核心修改區塊 2：分割並依序顯示每個段落 ***
        // ******************************************************
        
        // 1. 根據 ||| 分割成多個段落
        const responseParts = aiResponse.split('|||').map(part => part.trim()).filter(part => part.length > 0);
        
        if (responseParts.length > 0) {
            // 2. 依序顯示每個段落到新的聊天氣泡
            for (const part of responseParts) {
                // 我們可以加入一個小的延遲，模擬真人打字的速度 (可選)
                // await new Promise(resolve => setTimeout(resolve, 500)); 
                displayMessage(part, 'system');
            }
        } else {
             // 如果 AI 回覆了，但沒有 ||| 標記，則顯示完整回覆
             displayMessage(aiResponse, 'system');
        }
        
        // ******************************************************
        
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
