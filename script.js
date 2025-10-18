// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
const API_KEY = "AIzaSyCUIibepz0j_6J2wzmnYjftC-IIL1FI28E"; 
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');

// 顯示訊息到聊天室
function displayMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${type}-message`);
    messageDiv.innerText = content;
    chatArea.appendChild(messageDiv);
    // 自動捲動到底部
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 處理發送按鈕點擊事件
sendButton.addEventListener('click', async () => {
    const userText = userInput.value.trim();
    if (userText === '') return; // 輸入框為空則不做任何事

    // 1. 顯示使用者訊息
    displayMessage(userText, 'user');
    userInput.value = ''; // 清空輸入框
    sendButton.disabled = true; // 禁用按鈕，防止重複發送

    // 2. 準備 AI 提示語 (Prompt)
    // 這裡我們給 AI 一個角色設定，讓它像「家庭溝通顧問」
    const fullPrompt = `你是一個溫暖、主觀且富有同理心的家庭溝通顧問 AI。你的目標是針對使用者描述的家庭情境，提供安慰、肯定感受，並給予具體且溫和的建議。請使用繁體中文回覆。情境："${userText}"`;

    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        // 設定模型，我們使用輕量且快速的 flash 模型
        config: {
            // 您可以調整 temperature 來控制創意程度，0.7 是一個折衷的選擇
            temperature: 0.7 
        }
    };

    try {
        // 3. 呼叫 Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        // 4. 處理 AI 回覆
        let aiResponse = "很抱歉，無法取得回覆。請檢查 API 金鑰或網路連線。";
        
        // 檢查是否有生成內容
        if (data.candidates && data.candidates.length > 0) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `API 錯誤: ${data.error.message}`;
        }

        displayMessage(aiResponse, 'system');

    } catch (error) {
        console.error("Fetch Error:", error);
        displayMessage("發生連線錯誤，請稍後再試。", 'system');
    } finally {
        sendButton.disabled = false; // 重新啟用按鈕
    }
});

// 額外功能：按 Enter 鍵發送
userInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { // 按 Enter 且沒有按 Shift
        e.preventDefault(); // 阻止換行
        sendButton.click();
    }

});
