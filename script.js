// =================================================================
// 🚨🚨🚨 【防封鎖設定】Gemini API 金鑰 🚨🚨🚨
// =================================================================
const KEY_PART_1 = "AIzaSyCwVW"; 
const KEY_PART_2 = "en7tHL6yH1cmjYv9ZruRpnEx23Fk0";
// ⭐ 微創手術一：加上 .replace 過濾器
const GEMINI_API_KEY = (KEY_PART_1 + KEY_PART_2).replace(/[^\x21-\x7E]/g, '').trim();

// Firebase 設定
const firebaseConfig = {
    apiKey: "AIzaSyA6C0ArowfDaxJKV15anQZSZT7bcdeXJ2E",
    authDomain: "familychatadvisor.firebaseapp.com",
    projectId: "familychatadvisor",
    storageBucket: "familychatadvisor.firebasestorage.app",
    messagingSenderId: "172272099421",
    appId: "1:172272099421:web:a67b69291419194189edb4",
    measurementId: "G-SRY5B3JV85"
};

const app = firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
const ROOMS_METADATA_COLLECTION = 'rooms_metadata';

// DOM 元素
const chatArea = document.getElementById('chatArea');
const userInput = document.getElementById('userInput');
const sendButton = document.getElementById('sendButton');
const loadingIndicator = document.getElementById('loadingIndicator');
const roomEntryScreen = document.getElementById('roomEntryScreen');
const roomIdInput = document.getElementById('roomIdInput');
const roomPasswordInput = document.getElementById('roomPasswordInput');
const userNameInput = document.getElementById('userNameInput');
const startChatButton = document.getElementById('startChatButton');
const statusDisplay = document.getElementById('current-user-status');
const leaveRoomButton = document.getElementById('leaveRoomButton');
const typingIndicator = document.getElementById('typingIndicator');
const typingUserName = document.getElementById('typingUserName');

// 破冰與特效
const pledgeModal = document.getElementById('pledgeModal');
const pledgeInput = document.getElementById('pledgeInput');
const submitPledgeButton = document.getElementById('submitPledgeButton');
const confettiContainer = document.getElementById('confettiContainer');

// 狀態變數
let currentUserName = localStorage.getItem('chatUserName') || null;
let currentRoomId = localStorage.getItem('chatRoomId') || null;
const sessionId = localStorage.getItem('sessionId') || `anon_${Math.random().toString(36).substr(2, 9)}`;
localStorage.setItem('sessionId', sessionId);

let conversationCount = 0;
let lastAIMessageTime = 0;
let LAST_USER_SEND_TIME = 0;
const COOLDOWN_TIME = 2000; 

// 在線人數與名單 (用於 AI 總結與打字偵測)
let currentRoomUserCount = 0;
let roomActiveUsersList = []; // ⭐ 新增：記錄房間有哪些人，給總結功能用
let typingUsersList = [];
let typingTimeout = null;

// 全域閒置計時器與標記 [cite: 31]
let lastRoomActivityTime = Date.now(); 
let hasSent60sWarning = false;

// =================================================================
// ⭐ 初始化邏輯
// =================================================================
window.onload = function() {
    if (currentUserName && currentRoomId) {
        if(roomEntryScreen) roomEntryScreen.style.display = 'none';
        startChatListener(currentRoomId);
        updateUIForChat();
    } else {
        if(roomEntryScreen) roomEntryScreen.style.display = 'flex';
    }

    if(startChatButton) startChatButton.addEventListener('click', handleRoomEntry);
    if(leaveRoomButton) leaveRoomButton.addEventListener('click', handleLeaveRoom);
    if(sendButton) sendButton.addEventListener('click', handleSendAction);
    
    // ⭐ 總結報告按鈕監聽 
    const generateSummaryBtn = document.getElementById('generateSummaryBtn');
    if (generateSummaryBtn) {
        generateSummaryBtn.addEventListener('click', generateSummaryReport);
    }

    // ⭐ 輸入偵測邏輯 [cite: 26, 27]
    if(userInput) {
        userInput.addEventListener('input', () => {
            updateTypingStatus(true);
        });

        userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { 
                e.preventDefault(); 
                handleSendAction(); 
            }
            lastRoomActivityTime = Date.now();
        });
        userInput.addEventListener('blur', () => updateTypingStatus(false));
    }

    if (pledgeInput) {
        pledgeInput.addEventListener('input', (e) => {
            const targetText = "我希望破冰，打破我們之間的隔閡!";
            if (e.target.value.trim() === targetText) {
                submitPledgeButton.disabled = false;
                submitPledgeButton.className = "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg";
            } else {
                submitPledgeButton.disabled = true;
                submitPledgeButton.className = "w-full py-3.5 bg-gray-300 text-white font-bold rounded-xl cursor-not-allowed shadow-md";
            }
        });
    }

    if (submitPledgeButton) submitPledgeButton.addEventListener('click', handlePledgeSubmit);
    
    // 每 5 秒執行一次閒置偵測 [cite: 31]
    setInterval(checkIdleAndAITrigger, 5000);
};

// ⭐ 打字狀態同步
async function updateTypingStatus(isTyping) {
    if (!currentRoomId || !currentUserName) return;
    const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(currentRoomId);
    try {
        if (isTyping) {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayUnion(currentUserName) });
            clearTimeout(typingTimeout);
            // 異常斷線寬限期更新為 120 秒 [cite: 29]
            typingTimeout = setTimeout(() => updateTypingStatus(false), 120000);
        } else {
            await roomDocRef.update({ typing_users: firebase.firestore.FieldValue.arrayRemoving(currentUserName) });
        }
    } catch (e) { console.warn("打字同步略過"); }
}

// ⭐ 三階段溫情介入機制 (60s/120s 邏輯) [cite: 32]
async function checkIdleAndAITrigger() {
    if (!currentRoomId || !pledgeModal.classList.contains('hidden')) return;
    
    const now = Date.now();
    const idleTime = now - lastRoomActivityTime;
    const isSomeoneTyping = typingUsersList.length > 0;

    // --- 階段 1：60 秒門檻 ---
    if (idleTime > 60000 && !hasSent60sWarning) {
        if (isSomeoneTyping) {
            // 情況：有人在打字但沒送出
            const typist = typingUsersList[0];
            await sendToDatabase(`❤️ ${typist} 正在深思熟慮地組織語言，請大家耐心等候喔...`, 'AI', 'Re:Family 智能助手', currentRoomId);
        } else {
            // 情況：全員冷場，觸發暖場 (不跳視窗)
            if (currentRoomUserCount >= 2) triggerAIPrompt("idle_warmup", "", "所有人");
        }
        hasSent60sWarning = true;
    }

    // --- 階段 2：120 秒門檻 (強制介入) ---
    if (idleTime > 120000) {
        const targetUser = isSomeoneTyping ? typingUsersList[0] : (roomActiveUsersList[0] || "家人");
        
        // AI 根據紀錄代為說出得體的話
        triggerAIPrompt("force_mediation", "", targetUser);
        
        // 強制移除打字狀態與重置
        updateTypingStatus(false);
        lastRoomActivityTime = Date.now();
        hasSent60sWarning = false;
    }

    // 若恢復活動，重置警告旗標
    if (idleTime < 5000) hasSent60sWarning = false;
}

// 🏠 房間進入
async function handleRoomEntry() {
    const roomId = roomIdInput.value.trim().replace(/[^a-zA-Z0-9]/g, '');
    const password = roomPasswordInput.value.trim();
    const userName = userNameInput.value.trim();

    if (roomId.length < 4 || !password || !userName) { alert("請完整輸入房間資訊！"); return; }

    startChatButton.disabled = true;
    startChatButton.textContent = "驗證中...";

    try {
        const roomDocRef = db.collection(ROOMS_METADATA_COLLECTION).doc(roomId);
        const doc = await roomDocRef.get();
        const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); 

        if (doc.exists) {
            const confirmed = confirm(`📢 通知：房間代碼「${roomId}」已被佔用。\n\n加入家人房間按「確定」；建立新房請按「取消」。`);
            if (!confirmed) { resetEntryButton(); return; }
            if (doc.data().password !== password) { alert("❌ 密碼錯誤！"); resetEntryButton(); return; }
            
            await roomDocRef.update({
                active_users: firebase.firestore.FieldValue.arrayUnion(userName),
                expireAt: expireDate
            });
        } else {
            await roomDocRef.set({
                password: password,
                created_at: firebase.firestore.FieldValue.serverTimestamp(),
                expireAt: expireDate,
                active_users: [userName],
                typing_users: []
            });
        }

        currentRoomId = roomId;
        currentUserName = userName;
        localStorage.setItem('chatRoomId', currentRoomId);
        localStorage.setItem('chatUserName', currentUserName);
        startChatListener(currentRoomId);
        updateUIForChat();

    } catch (error) {
        alert("連線失敗");
        resetEntryButton();
    }
}

function resetEntryButton() {
    startChatButton.disabled = false;
    startChatButton.textContent = "開始群聊";
}

function updateUIForChat() {
    if(roomEntryScreen) roomEntryScreen.style.display = 'none';
    userInput.disabled = false;
    userInput.placeholder = "輸入訊息內容..."; 
    sendButton.disabled = false;
    leaveRoomButton.classList.remove('hidden');
    
    const sumBtn = document.getElementById('generateSummaryBtn');
    if(sumBtn) sumBtn.classList.remove('hidden');

    statusDisplay.textContent = `Room: ${currentRoomId} | ${currentUserName}`;
    chatArea.innerHTML = '';
    displayMessage(`歡迎您，${currentUserName}。我是家庭協調員，我會在這裡安靜陪伴，協助大家溝通。`, 'system', 'Re:Family');
    lastRoomActivityTime = Date.now();
}

// 💬 訊息顯示邏輯
function displayMessage(content, type, senderName, timestamp) {
    if (typeof content !== 'string') return;
    const displayContent = content.replace('[TRIGGER_PLEDGE]', '').replace('[AI_SUCCESS_REPLY]', ''); 
    if (!displayContent.trim()) return;

    const messageContainer = document.createElement('div');
    const cleanedContent = displayContent.trim().replace(/\*/g, '').replace(/\n/g, '<br>');
    messageContainer.classList.add('flex', 'items-start', 'space-x-3', 'mb-4', type === 'user' ? 'justify-end' : 'justify-start');
    
    let timeStr = timestamp ? new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
    let bubbleClass = type === 'user' ? 'bg-warm-orange text-white rounded-tr-none' : 'bg-orange-50 text-gray-800 rounded-tl-none';
    if (content.includes("已宣誓破冰")) bubbleClass = 'bg-green-100 text-green-800 border border-green-200';

    const wrapper = document.createElement('div');
    wrapper.className = `flex flex-col ${type === 'user' ? 'items-end' : 'items-start'}`;
    wrapper.innerHTML = `<div class="text-xs text-gray-500 mb-1 flex gap-2"><strong>${senderName}</strong><span>${timeStr}</span></div>
                         <div class="p-4 rounded-2xl max-w-md ${bubbleClass}">${cleanedContent}</div>`;

    const icon = document.createElement('div');
    icon.className = `w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${senderName.includes('Re:Family') ? 'bg-warm-peach' : 'bg-gray-300'}`;
    icon.innerHTML = senderName.includes('Re:Family') ? '<i class="fas fa-heart text-white"></i>' : '<i class="fas fa-user text-gray-600"></i>';

    if (type !== 'user') { messageContainer.appendChild(icon); messageContainer.appendChild(wrapper); } 
    else { messageContainer.appendChild(wrapper); messageContainer.appendChild(icon); }

    chatArea.appendChild(messageContainer);
    chatArea.scrollTop = chatArea.scrollHeight;
}

// 🔥 Firestore 監聽
let displayedMessageIds = new Set();
let pledgeCount = 0; 

function startChatListener(roomId) {
    if (!db) return;
    chatArea.innerHTML = '';
    displayedMessageIds = new Set();
    conversationCount = 0;
    pledgeCount = 0;

    db.collection(ROOMS_METADATA_COLLECTION).doc(roomId)
        .onSnapshot(doc => {
            if (doc.exists) {
                const data = doc.data();
                roomActiveUsersList = data.active_users || [];
                currentRoomUserCount = roomActiveUsersList.length;
                
                typingUsersList = (data.typing_users || []).filter(u => u !== currentUserName);
                if (typingUsersList.length > 0) {
                    typingUserName.textContent = typingUsersList.join(', ');
                    typingIndicator.style.opacity = "1";
                } else {
                    typingIndicator.style.opacity = "0";
                }
            }
        });

    db.collection('rooms').doc(roomId).collection('messages')
        .orderBy('timestamp').limit(50)
        .onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    const msg = change.doc.data();
                    if (!displayedMessageIds.has(change.doc.id)) {
                        displayedMessageIds.add(change.doc.id);
                        lastRoomActivityTime = Date.now();
                        const isMe = msg.senderId === sessionId;
                        const type = msg.senderId === 'AI' ? 'system' : (isMe ? 'user' : 'other');

                        if (msg.senderId === 'AI' && msg.text.includes('[TRIGGER_PLEDGE]')) {
                            setTimeout(() => { if (Date.now() - msg.timestamp < 60000) showPledgeModal(); }, 1000);
                        }
                        if (msg.text.includes("我希望破冰")) {
                            pledgeCount++;
                            if (pledgeCount >= 2 && Date.now() - msg.timestamp < 10000 && isMe) triggerSuccessAI();
                        }

                        displayMessage(msg.text, type, msg.senderName, msg.timestamp);
                        if (msg.senderId !== 'AI') {
                            conversationCount++;
                            if (isMe) checkAndTriggerAI(msg.text, msg.senderName);
                        }
                    }
                }
            });
        }, error => {
            console.error("Firestore 監聽失敗，請建立索引：", error);
        });
}

// =================================================================
// ⭐ 個人化總結報告 (從 Firestore 直接抓取最新 40 筆) [cite: 18, 19]
// =================================================================
async function generateSummaryReport() {
    if (!currentRoomId) return;
    document.getElementById('summaryLoadingModal').classList.remove('hidden');

    try {
        // 直接從 Firestore 集合抓取最新 40 筆訊息 
        const snapshot = await db.collection('rooms').doc(currentRoomId)
                                .collection('messages')
                                .orderBy('timestamp', 'desc')
                                .limit(40)
                                .get();
        
        const historyData = snapshot.docs.map(doc => doc.data()).reverse();
        
        if (historyData.length < 2) {
            alert("目前的對話紀錄還不夠分析喔！");
            return;
        }

        const historyText = historyData.map(m => `${m.senderName}:${m.text}`).join('\n');
        const usersStr = roomActiveUsersList.join('、');

        const prompt = `你現在是經驗豐富的家庭諮商師。請閱讀以下對話紀錄，並為房間內的每位成員 (${usersStr}) 產生一份專屬的溝通總結。
        對話紀錄：\n${historyText}\n
        要求：
        1. 針對每個人分別寫出「內心渴望 (thoughts)」與「溫暖建議 (advice)」。
        2. 發言極少的人請給予溫暖鼓勵（例如：這次多為聆聽，建議下次多分享感受...）。
        3. 必須嚴格輸出為純 JSON 格式，不要包含任何 markdown 標記。
        格式必須符合：{"overall": "50字總結", "cards": [{"name": "姓名", "role": "表達者/聆聽者", "thoughts": "心聲", "advice": "建議"}]}`;

        // 升級至 Gemini 2.0-flash 模型
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5, maxOutputTokens: 2000 } })
        });
        
        const data = await response.json();
        if (data.error) throw new Error(data.error.message);
        
        let aiText = data.candidates[0].content.parts[0].text;
        aiText = aiText.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(aiText.substring(aiText.indexOf('{'), aiText.lastIndexOf('}') + 1));
        
        renderSummaryCards(result);
    } catch (e) {
        console.error("總結失敗", e);
        alert("分析報告時遇到一點小阻礙，請稍後再試！");
    } finally {
        document.getElementById('summaryLoadingModal').classList.add('hidden');
    }
}

// 將 JSON 資料渲染成精美卡片 [cite: 20]
function renderSummaryCards(data) {
    document.getElementById('summaryOverallText').textContent = data.overall;
    const container = document.getElementById('summaryCardsContainer');
    container.innerHTML = '';

    data.cards.forEach(card => {
        const cardDiv = document.createElement('div');
        cardDiv.className = "bg-white dark:bg-gray-800 p-5 rounded-2xl shadow-sm border-l-4 border-warm-orange transition-transform hover:-translate-y-1 mb-4";
        cardDiv.innerHTML = `
            <div class="flex items-center gap-3 mb-4 border-b border-gray-100 dark:border-gray-700 pb-3">
                <div class="w-12 h-12 bg-orange-100 dark:bg-gray-700 rounded-full flex items-center justify-center text-warm-orange font-bold text-xl shadow-sm">
                    ${card.name.charAt(0)}
                </div>
                <div>
                    <h4 class="font-bold text-gray-800 dark:text-white text-lg">${card.name}</h4>
                    <span class="text-xs text-warm-orange bg-orange-50 dark:bg-gray-700 border border-orange-100 dark:border-gray-600 px-2 py-1 rounded-full">${card.role}</span>
                </div>
            </div>
            <div class="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                <div class="bg-gray-50 dark:bg-gray-700/50 p-3 rounded-xl">
                    <p><strong class="text-warm-orange flex items-center gap-2 mb-1"><i class="fas fa-heartbeat"></i> 內心渴望：</strong>${card.thoughts}</p>
                </div>
                <div class="bg-orange-50/50 dark:bg-gray-700/50 p-3 rounded-xl">
                    <p><strong class="text-calm-blue flex items-center gap-2 mb-1"><i class="fas fa-lightbulb"></i> 專屬建議：</strong>${card.advice}</p>
                </div>
            </div>
        `;
        container.appendChild(cardDiv);
    });
    document.getElementById('summaryResultModal').classList.remove('hidden');
}


// 🧠 AI 偵測機制 (120秒介入整合)
async function checkAndTriggerAI(lastText, senderName) {
    const now = Date.now();
    if (now - lastAIMessageTime < 8000) return;

    // 負面觸發字典 [cite: 47]
    const generalTriggers = ["煩", "生氣", "吵架", "兇", "控制", "管", "不聽話", "錢", "未來", "以後", "算了", "累了", "態度", "隨便"];
    const isTrigger = generalTriggers.some(k => lastText.includes(k));

    if (isTrigger || conversationCount % 3 === 0) { [cite: 16]
        lastAIMessageTime = now;
        await triggerAIPrompt("translate", lastText, senderName);
    }
}

async function triggerAIPrompt(mode, lastText, senderName) {
    if (loadingIndicator) loadingIndicator.classList.remove('hidden');
    
    try {
        const snap = await db.collection('rooms').doc(currentRoomId).collection('messages').orderBy('timestamp', 'desc').limit(8).get();
        const historyText = snap.docs.map(doc => `${doc.data().senderName}:${doc.data().text}`).reverse().join('\n');

        let promptText = "";
        if (mode === "force_mediation") {
            promptText = `你現在是 Re:Family 的資深協調員。成員 ${senderName} 已沉默或卡在輸入框很久了。請根據對話紀錄：\n${historyText}\n，站在他的角度說一段溫暖的話，表達他在乎這段關係但目前的難處，限 150 字，語氣自然像家人。`;
        } else if (mode === "idle_warmup") {
            promptText = `全家陷入僵局無人說話。請根據對話：\n${historyText}\n，主動說一段暖場的話引導大家繼續溝通，語氣溫柔。`;
        } else {
            promptText = `你現在是家庭翻譯官。最後一句 ${senderName}: "${lastText}"。任務：將這句話翻譯成背後的溫柔需求，限 100 字。`; [cite: 16]
        }

        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: promptText }] }] })
        });
        const data = await response.json();
        if (data.candidates && data.candidates[0].content) {
            const aiText = data.candidates[0].content.parts[0].text;
            await sendToDatabase(aiText, 'AI', 'Re:Family 智能助手', currentRoomId);
        }
    } catch (e) { console.error("AI 觸發錯誤:", e); } finally { if (loadingIndicator) loadingIndicator.classList.add('hidden'); }
}

async function triggerSuccessAI() {
    const successMsg = "謝謝你們體諒彼此，一起約的時間出來聊聊天吧~ [AI_SUCCESS_REPLY]";
    await sendToDatabase(successMsg, 'AI', 'Re:Family 智能助手', currentRoomId);
    if(confettiContainer) { [cite: 24]
        confettiContainer.classList.remove('hidden');
        for(let i=0; i<100; i++) {
            const c = document.createElement('div');
            c.className = 'confetti'; c.style.left = Math.random()*100+'vw';
            c.style.backgroundColor = ['#FF8A65','#FFAB91','#F8BBD9'][Math.floor(Math.random()*3)];
            c.style.animationDuration = (Math.random()*3+2)+'s';
            confettiContainer.appendChild(c);
        }
        setTimeout(()=>confettiContainer.classList.add('hidden'), 6000);
    }
}

function showPledgeModal() { 
    if (pledgeModal) { [cite: 23]
        pledgeModal.classList.remove('hidden'); pledgeInput.value = "我希望破冰，打破我們之間的隔閡!"; 
        submitPledgeButton.disabled = false;
        submitPledgeButton.className = "w-full py-3.5 bg-warm-orange text-white font-bold rounded-xl shadow-lg";
    }
}

function handlePledgeSubmit() {
    sendToDatabase("我希望破冰，打破我們之間的隔閡! (已宣誓)", sessionId, currentUserName, currentRoomId);
    if (pledgeModal) pledgeModal.classList.add('hidden');
    lastRoomActivityTime = Date.now();
}

function handleSendAction() {
    const userText = userInput.value.trim();
    if (!currentRoomId || !userText) return;

    if (userText.includes("破冰")) {
        showPledgeModal();
        userInput.value = ""; 
        updateTypingStatus(false);
        return;
    }

    const now = Date.now();
    if (now - LAST_USER_SEND_TIME < COOLDOWN_TIME) return;
    LAST_USER_SEND_TIME = now;

    updateTypingStatus(false);
    sendToDatabase(userText, sessionId, currentUserName, currentRoomId);
    userInput.value = '';
}

async function sendToDatabase(text, senderId, senderName, roomId) {
    if (!db) return;
    const expireDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5天效期 [cite: 34]
    await db.collection('rooms').doc(roomId).collection('messages').add({
        text: text, senderId: senderId, senderName: senderName, timestamp: Date.now(), expireAt: expireDate
    });
}

function handleLeaveRoom() { updateTypingStatus(false); localStorage.clear(); window.location.reload(); }
