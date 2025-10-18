// 🚨 替換成您在 Google AI Studio 取得的 API 金鑰 🚨
// 務必將 YOUR_API_KEY_HERE 替換為您的實際金鑰，並確保金鑰在雙引號內部
const API_KEY = "AIzaSyCUIibepz0j_6J2wzmnYjftC-IIL1FI28E"; 

// 取得 DOM 元素
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');

// 顯示訊息到聊天室
function displayMessage(content, type) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${type}-message`);
    // 使用 innerHTML 和 <br> 讓回覆中的換行符號 (\n) 能正確顯示
    messageDiv.innerHTML = content.replace(/\n/g, '<br>'); 
    chatArea.appendChild(messageDiv);
    // 自動捲動到底部
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 處理發送訊息的核心函式
async function sendMessage() {
    const userText = userInput.value.trim();
    if (userText === '') return; 

    // 1. 顯示使用者訊息
    displayMessage(userText, 'user');
    userInput.value = ''; // 清空輸入框

    // 2. 禁用按鈕、輸入框並顯示讀取中提示
    sendButton.disabled = true; 
    userInput.disabled = true;
    loadingIndicator.classList.add('visible');

    // 3. 準備 AI 提示語 (Prompt)
    const fullPrompt = `你是一個溫暖、主觀且富有同理心的家庭溝通顧問 AI。你的目標是針對使用者描述的家庭情境（例如：與父母/配偶/子女的爭執、誤解、壓力等），提供**三個步驟**的回覆：
1. **溫柔的安慰** (同理心表達，肯定使用者感受)。
2. **客觀的分析** (點出情境中可能的溝通盲點或雙方立場)。
3. **具體的建議** (提出 1-2 個溫和、可操作的溝通方法)。
請使用繁體中文，並將回覆分段，讓閱讀更輕鬆。情境："${userText}"`;

    // 4. API 呼叫結構：使用修正後的 generationConfig
    const requestBody = {
        contents: [{
            role: "user",
            parts: [{ text: fullPrompt }]
        }],
        // 錯誤修正：將 config 改為 generationConfig
        generationConfig: { 
            temperature: 0.7 
        }
    };

    try {
        // 5. 呼叫 Gemini API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestBody)
        });

        const data = await response.json();
        
        // 6. 處理 AI 回覆
        let aiResponse = "很抱歉，無法取得回覆。請檢查 API 金鑰是否正確，或確認您的網路連線。";
        
        // 檢查是否有生成內容
        if (data.candidates && data.candidates.length > 0 && data.candidates[0].content && data.candidates[0].content.parts) {
            aiResponse = data.candidates[0].content.parts[0].text;
        } else if (data.error) {
             aiResponse = `**API 錯誤**：無法完成請求。錯誤訊息：${data.error.message}`;
        } else if (data.promptFeedback && data.promptFeedback.blockReason) {
             // 處理內容審核阻止的情況
             aiResponse = `**內容被阻止**：您的請求可能違反了內容政策，原因：${data.promptFeedback.blockReason}`;
        }

        displayMessage(aiResponse, 'system');

    } catch (error) {
        console.error("Fetch Error:", error);
        displayMessage("發生連線錯誤，請檢查您的網路或重新整理頁面。", 'system');
    } finally {
        // 7. 重新啟用按鈕並隱藏讀取中提示
        sendButton.disabled = false;
        userInput.disabled = false;
        loadingIndicator.classList.remove('visible');
        userInput.focus(); 
    }
}

// 事件監聽器：點擊發送按鈕
sendButton.addEventListener('click', sendMessage);

// 事件監聽器：按 Enter 鍵發送
userInput.addEventListener('keydown', (e) => {
    // 判斷：單獨按下 Enter 鍵時發送
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) { 
        e.preventDefault(); 
        sendMessage();
    }
});
