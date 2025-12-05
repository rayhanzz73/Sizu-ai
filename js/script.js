// Global variables
let currentUserId = 'user_' + Math.random().toString(36).substr(2, 9);
let selectedImageFile = null;
let isLoading = false;

// DOM elements
const chatMessages = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('send-btn');
const imageInput = document.getElementById('image-input');
const imagePreview = document.getElementById('image-preview');
const loadingOverlay = document.getElementById('loading-overlay');
const charCount = document.getElementById('char-count');
const totalRequestsEl = document.getElementById('total-requests');
const userRequestsEl = document.getElementById('user-requests');

// Initialize the app
document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    loadChatHistory();
    updateStats();
    autoResizeTextarea();
    setupMobileOptimizations();
    addLoadingText();
});

// Mobile optimizations
function setupMobileOptimizations() {
    // Prevent zoom on iOS when focusing inputs
    if (/iPad|iPhone|iPod/.test(navigator.userAgent)) {
        const viewport = document.querySelector('meta[name=viewport]');
        if (viewport) {
            viewport.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
        }
    }

    // Add touch feedback
    document.querySelectorAll('button, .example-btn, .quick-btn, .feature').forEach(el => {
        el.addEventListener('touchstart', function() {
            this.style.opacity = '0.8';
        });

        el.addEventListener('touchend', function() {
            this.style.opacity = '1';
        });
    });

    // Improve scroll performance
    if ('scrollBehavior' in document.documentElement.style) {
        document.documentElement.style.scrollBehavior = 'smooth';
    }

    // Add pull-to-refresh prevention
    document.addEventListener('touchstart', function(e) {
        if (e.touches.length !== 1) return;

        const touch = e.touches[0];
        if (touch.pageY > 40) return;

        e.preventDefault();
    }, { passive: false });
}

// Dynamic loading text for better UX
function addLoadingText() {
    const loadingTexts = [
        'Shizuka is thinking... 💭',
        'Processing your request... ✨',
        'Creating magic for you... 🌟',
        'Almost ready... 💖',
        'Generating response... 🎀'
    ];

    let textIndex = 0;
    window.updateLoadingText = function() {
        const loadingText = document.querySelector('.loading-spinner p');
        if (loadingText) {
            loadingText.textContent = loadingTexts[textIndex];
            textIndex = (textIndex + 1) % loadingTexts.length;
        }
    };
}

// Event listeners
function setupEventListeners() {
    // Message input events
    messageInput.addEventListener('input', function() {
        updateCharCount();
        updateSendButton();
        autoResizeTextarea();
    });

    messageInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Image input events
    imageInput.addEventListener('change', handleImageSelect);

    // Send button
    sendBtn.addEventListener('click', sendMessage);

    // Auto-update stats every 30 seconds
    setInterval(updateStats, 30000);
}

// Auto-resize textarea
function autoResizeTextarea() {
    messageInput.style.height = 'auto';
    messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + 'px';
}

// Update character count
function updateCharCount() {
    const count = messageInput.value.length;
    charCount.textContent = `${count}/2000`;

    if (count > 1800) {
        charCount.style.color = 'var(--error-color)';
    } else if (count > 1500) {
        charCount.style.color = 'var(--warning-color)';
    } else {
        charCount.style.color = 'var(--text-muted)';
    }
}

// Update send button state
function updateSendButton() {
    const hasText = messageInput.value.trim().length > 0;
    const hasImage = selectedImageFile !== null;

    sendBtn.disabled = !hasText && !hasImage || isLoading;
}

// Handle image selection
function handleImageSelect(e) {
    const file = e.target.files[0];
    if (file) {
        if (file.size > 10 * 1024 * 1024) {
            showToast('Image size must be less than 10MB', 'error');
            return;
        }

        selectedImageFile = file;

        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById('preview-img');
            img.src = e.target.result;
            imagePreview.style.display = 'block';
        };
        reader.readAsDataURL(file);

        updateSendButton();
    }
}

// Remove selected image
function removeImage() {
    selectedImageFile = null;
    imageInput.value = '';
    imagePreview.style.display = 'none';
    updateSendButton();
}

// Send example message
function sendExample(text) {
    messageInput.value = text;
    updateSendButton();
    updateCharCount();
    sendMessage();
}

// Send message
async function sendMessage() {
    if (isLoading) return;

    const messageText = messageInput.value.trim();
    if (!messageText && !selectedImageFile) return;

    isLoading = true;
    showLoading(true);
    updateSendButton();

    // Add user message to chat
    if (messageText) {
        addMessage('user', messageText, selectedImageFile);
    }

    // Clear input
    messageInput.value = '';
    updateCharCount();
    autoResizeTextarea();

    try {
        const formData = new FormData();
        formData.append('uid', currentUserId);
        formData.append('message', messageText || 'Image uploaded');

        if (selectedImageFile) {
            // Convert image to base64 URL for API
            const imageUrl = await fileToBase64(selectedImageFile);
            formData.append('image_url', imageUrl);
        }

        const response = await fetch('/chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                uid: currentUserId,
                message: messageText || 'Image uploaded',
                image_url: selectedImageFile ? await fileToBase64(selectedImageFile) : null
            }),
            signal: AbortSignal.timeout(180000) // 3 minutes timeout
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        // Add bot response
        addBotMessage(data);

        // Update stats
        updateStatsFromResponse(data);

        // Clear image selection
        removeImage();

        // Scroll to bottom
        scrollToBottom();

    } catch (error) {
        console.error('Error sending message:', error);

        let errorMessage = 'Sorry, I encountered an error processing your request.';
        if (error.message.includes('NetworkError') || error.message.includes('fetch')) {
            errorMessage = 'Network connection issue. Please check your internet and try again.';
        } else if (error.message.includes('500')) {
            errorMessage = 'Server is experiencing issues. Please try again in a moment.';
        }

        showToast(errorMessage, 'error');

        // Add friendly error message to chat
        addMessage('bot', `🤖 ${errorMessage}\n\nDon't worry, I'm still here to help! Try sending your message again or ask me something else.`, null, true);
    } finally {
        isLoading = false;
        showLoading(false);
        updateSendButton();
    }
}

// Convert file to base64
function fileToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => resolve(reader.result);
        reader.onerror = error => reject(error);
    });
}

// Add message to chat
function addMessage(sender, text, imageFile = null, isError = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = sender === 'user' ? '<i class="material-icons">person</i>' : '<i class="material-icons">favorite</i>';

    const content = document.createElement('div');
    content.className = 'message-content';

    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.textContent = text;

    content.appendChild(textDiv);

    if (imageFile && sender === 'user') {
        const imageDiv = document.createElement('div');
        imageDiv.className = 'message-image';

        const img = document.createElement('img');
        const reader = new FileReader();
        reader.onload = (e) => {
            img.src = e.target.result;
        };
        reader.readAsDataURL(imageFile);

        imageDiv.appendChild(img);
        content.appendChild(imageDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    // Remove welcome message if it exists
    const welcomeMessage = chatMessages.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Add bot message with special content
function addBotMessage(data) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message bot';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar';
    avatar.innerHTML = '<i class="material-icons">favorite</i>';

    const content = document.createElement('div');
    content.className = 'message-content';

    // Add text content
    const textDiv = document.createElement('div');
    textDiv.className = 'message-text';
    textDiv.innerHTML = formatMessageText(data.reply);
    content.appendChild(textDiv);

    // Add image if generated
    if (data.image_url && data.isImage) {
        const imageContainer = createImageElement(data.image_url);
        messageDiv.appendChild(imageContainer);

        // Add retry button for failed images
        const img = imageContainer.querySelector('img');
        if (img) {
            img.onerror = function() {
                console.log('Image failed to load, adding retry option');
                const retryDiv = document.createElement('div');
                retryDiv.className = 'image-retry';
                retryDiv.innerHTML = `
                    <p>⚠️ Image couldn\'t load</p>
                    <button onclick="retryImageLoad('${data.image_url}', this)" class="retry-btn">
                        🔄 Try Again
                    </button>
                    <a href="${data.image_url}" target="_blank" class="direct-link">
                        🔗 Open Direct Link
                    </a>
                `;
                imageContainer.appendChild(retryDiv);
            };
        }
    }

    // Add music player if music data exists
    if (data.music_data) {
        const musicDiv = document.createElement('div');
        musicDiv.className = 'message-music';

        musicDiv.innerHTML = `
            <div class="music-info">
                <i class="fas fa-music"></i>
                <div class="music-details">
                    <h4>${data.music_data.title}</h4>
                    <p>by ${data.music_data.author}</p>
                </div>
            </div>
            <audio controls class="music-player">
                <source src="${data.music_data.downloadUrl}" type="audio/mpeg">
                Your browser does not support the audio element.
            </audio>
        `;

        content.appendChild(musicDiv);
    }

    // Add video if Shoti data exists
    if (data.shotti_data) {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'message-video';

        videoDiv.innerHTML = `
            <div class="video-info">
                <i class="fas fa-video"></i>
                <div class="video-details">
                    <h4>${data.shotti_data.title}</h4>
                    <p>by @${data.shotti_data.username}</p>
                </div>
            </div>
            <video controls preload="metadata" style="width: 100%; max-width: 100%; height: auto; border-radius: var(--border-radius-md); background: #000;">
                <source src="${data.shotti_data.videoUrl}" type="video/mp4">
                Your browser does not support the video element.
            </video>
        `;

        content.appendChild(videoDiv);
    }

    // Add video if video_data exists (from new API)
    if (data.video_data) {
        const videoDiv = document.createElement('div');
        videoDiv.className = 'message-video';

        videoDiv.innerHTML = `
            <div class="video-info">
                <i class="fas fa-video"></i>
                <div class="video-details">
                    <h4>${data.video_data.title}</h4>
                    <p>by ${data.video_data.author}</p>
                </div>
            </div>
            <video controls preload="metadata" style="width: 100%; max-width: 100%; height: auto; border-radius: var(--border-radius-md); background: #000;">
                <source src="${data.video_data.downloadUrl}" type="video/mp4">
                Your browser does not support the video element.
            </video>
        `;

        content.appendChild(videoDiv);
    }

    // Add lyrics if lyrics data exists
    if (data.lyrics_data) {
        const lyricsDiv = document.createElement('div');
        lyricsDiv.className = 'message-lyrics';

        const artworkImage = data.lyrics_data.artwork_url ? 
            `<img src="${data.lyrics_data.artwork_url}" alt="Album Artwork" class="lyrics-artwork">` : 
            '<div class="lyrics-artwork-placeholder"><i class="fas fa-music"></i></div>';

        lyricsDiv.innerHTML = `
            <div class="lyrics-header">
                ${artworkImage}
                <div class="lyrics-info">
                    <h4>${data.lyrics_data.track_name}</h4>
                    <p>by ${data.lyrics_data.artist_name}</p>
                    <span class="lyrics-source">via ${data.lyrics_data.search_engine}</span>
                </div>
            </div>
            <div class="lyrics-content">
                <pre>${data.lyrics_data.lyrics}</pre>
            </div>
            <div class="lyrics-actions">
                <button onclick="copyLyrics(this)" class="copy-btn">
                    <i class="fas fa-copy"></i> Copy Lyrics
                </button>
                <button onclick="toggleLyricsExpand(this)" class="expand-btn">
                    <i class="fas fa-expand-alt"></i> Expand
                </button>
            </div>
        `;

        content.appendChild(lyricsDiv);
    }

    messageDiv.appendChild(avatar);
    messageDiv.appendChild(content);

    chatMessages.appendChild(messageDiv);
    scrollToBottom();
}

// Format message text
function formatMessageText(text) {
    return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`(.*?)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
}

// Update stats from response
function updateStatsFromResponse(data) {
    if (data.stats) {
        totalRequestsEl.textContent = data.stats.totalRequests || 0;
        userRequestsEl.textContent = data.stats.userRequests || 0;
    }
}

// Update stats
async function updateStats() {
    try {
        const response = await fetch('/chat/stats');
        if (response.ok) {
            const stats = await response.json();
            totalRequestsEl.textContent = stats.total?.requests || 0;
        }
    } catch (error) {
        console.error('Failed to update stats:', error);
    }
}

// Load chat history
async function loadChatHistory() {
    try {
        const response = await fetch(`/chat/history/${currentUserId}`);
        if (response.ok) {
            const data = await response.json();

            if (data.messages && data.messages.length > 0) {
                // Remove welcome message
                const welcomeMessage = chatMessages.querySelector('.welcome-message');
                if (welcomeMessage) {
                    welcomeMessage.remove();
                }

                // Add messages
                data.messages.forEach(msg => {
                    if (msg.role === 'user') {
                        addMessage('user', msg.content);
                    } else if (msg.role === 'assistant') {
                        const messageDiv = document.createElement('div');
                        messageDiv.className = 'message bot';

                        const avatar = document.createElement('div');
                        avatar.className = 'message-avatar';
                        avatar.innerHTML = '<i class="material-icons">favorite</i>';

                        const content = document.createElement('div');
                        content.className = 'message-content';

                        const textDiv = document.createElement('div');
                        textDiv.className = 'message-text';
                        textDiv.innerHTML = formatMessageText(msg.content);

                        content.appendChild(textDiv);
                        messageDiv.appendChild(avatar);
                        messageDiv.appendChild(content);

                        chatMessages.appendChild(messageDiv);
                    }
                });

                scrollToBottom();
            }
        }
    } catch (error) {
        console.error('Failed to load chat history:', error);
    }
}

// Clear chat
async function clearChat() {
    if (confirm('Are you sure you want to clear the chat history?')) {
        try {
            const response = await fetch(`/chat/clear/${currentUserId}`, {
                method: 'DELETE'
            });

            if (response.ok) {
                // Clear chat messages
                chatMessages.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">
                            <i class="material-icons">favorite</i>
                        </div>
                        <h2>Welcome to Orochi AI</h2>
                        <p>Your powerful, unfiltered AI assistant. I can help with:</p>
                        <div class="features">
                            <div class="feature">
                                <i class="material-icons">chat</i>
                                <span>Intelligent Conversations</span>
                            </div>
                            <div class="feature">
                                <i class="material-icons">image</i>
                                <span>Image Generation</span>
                            </div>
                            <div class="feature">
                                <i class="material-icons">music_note</i>
                                <span>Music Search & Play</span>
                            </div>
                            <div class="feature">
                                <i class="material-icons">video_library</i>
                                <span>Video Content</span>
                            </div>
                            <div class="feature">
                                <i class="material-icons">lyrics</i>
                                <span>Song Lyrics</span>
                            </div>
                        </div>
                        <div class="example-prompts">
                            <button class="example-btn" onclick="sendExample('Generate a futuristic cityscape')">
                                <i class="material-icons">image</i> Generate Image
                            </button>
                            <button class="example-btn" onclick="sendExample('Play Shape of You by Ed Sheeran')">
                                <i class="material-icons">music_note</i> Play Music
                            </button>
                            <button class="example-btn" onclick="sendExample('Tell me about quantum computing')">
                                <i class="material-icons">lightbulb</i> Ask Question
                            </button>
                            <button class="example-btn" onclick="sendExample('lyrics APT')">
                                <i class="material-icons">lyrics</i> Get Lyrics
                            </button>
                            <button class="example-btn" onclick="sendExample('shoti')">
                                <i class="material-icons">video_library</i> Random Video
                            </button>
                        </div>
                    </div>
                `;

                showToast('Chat history cleared!', 'success');
            } else {
                showToast('Failed to clear chat history', 'error');
            }
        } catch (error) {
            console.error('Error clearing chat:', error);
            showToast('Failed to clear chat history', 'error');
        }
    }
}

// Show/hide loading with dynamic text
function showLoading(show) {
    loadingOverlay.style.display = show ? 'flex' : 'none';

    if (show && window.updateLoadingText) {
        // Update loading text every 2 seconds
        const interval = setInterval(() => {
            if (loadingOverlay.style.display === 'none') {
                clearInterval(interval);
                return;
            }
            window.updateLoadingText();
        }, 2000);
    }
}

// Scroll to bottom
function scrollToBottom() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Show toast notification
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    const container = document.getElementById('toast-container');
    container.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// Handle clicks outside image preview
document.addEventListener('click', function(e) {
    if (e.target === imagePreview) {
        removeImage();
    }
});

// Prevent form submission on Enter in text areas
document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
    }
});

function createImageElement(imageUrl) {
    const imageContainer = document.createElement('div');
    imageContainer.className = 'image-container';

    // Add loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'image-loading';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <p>🎨 Generating your image...</p>
    `;
    imageContainer.appendChild(loadingDiv);

    const img = document.createElement('img');
    img.src = imageUrl;
    img.alt = 'Generated Image';
    img.className = 'generated-image';
    img.loading = 'lazy';
    img.style.opacity = '0';

    // Handle successful image load
    img.onload = function() {
        loadingDiv.style.display = 'none';
        img.style.opacity = '1';
        img.style.transition = 'opacity 0.3s ease';
    };

    // Handle image load error
    img.onerror = function() {
        loadingDiv.innerHTML = `
            <p>⚠️ Image generation in progress...</p>
            <small>This may take a moment to process</small>
        `;

        // Try to reload after a delay
        setTimeout(() => {
            img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 't=' + Date.now();
        }, 3000);
    };

    imageContainer.appendChild(img);
    return imageContainer;
}

// Retry image loading function
function retryImageLoad(imageUrl, buttonElement) {
    const container = buttonElement.closest('.image-container');
    const img = container.querySelector('img');
    const retryDiv = container.querySelector('.image-retry');

    if (retryDiv) retryDiv.style.display = 'none';

    // Add loading state
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'image-loading';
    loadingDiv.innerHTML = `
        <div class="loading-spinner"></div>
        <p>🔄 Retrying image load...</p>
    `;
    container.appendChild(loadingDiv);

    // Retry with cache busting
    img.src = imageUrl + (imageUrl.includes('?') ? '&' : '?') + 'retry=' + Date.now();

    img.onload = function() {
        loadingDiv.remove();
        img.style.opacity = '1';
        if (retryDiv) retryDiv.remove();
    };

    img.onerror = function() {
        loadingDiv.remove();
        if (retryDiv) retryDiv.style.display = 'block';
    };
}

// Copy lyrics to clipboard
function copyLyrics(buttonElement) {
    const lyricsDiv = buttonElement.closest('.message-lyrics');
    const lyricsText = lyricsDiv.querySelector('.lyrics-content pre').textContent;
    
    navigator.clipboard.writeText(lyricsText).then(() => {
        const originalText = buttonElement.innerHTML;
        buttonElement.innerHTML = '<i class="fas fa-check"></i> Copied!';
        buttonElement.style.background = 'var(--success-color)';
        
        setTimeout(() => {
            buttonElement.innerHTML = originalText;
            buttonElement.style.background = '';
        }, 2000);
        
        showToast('Lyrics copied to clipboard!', 'success');
    }).catch(err => {
        console.error('Failed to copy lyrics:', err);
        showToast('Failed to copy lyrics', 'error');
    });
}

// Toggle lyrics expand/collapse
function toggleLyricsExpand(buttonElement) {
    const lyricsContent = buttonElement.closest('.message-lyrics').querySelector('.lyrics-content');
    const isExpanded = lyricsContent.classList.contains('expanded');
    
    if (isExpanded) {
        lyricsContent.classList.remove('expanded');
        buttonElement.innerHTML = '<i class="fas fa-expand-alt"></i> Expand';
    } else {
        lyricsContent.classList.add('expanded');
        buttonElement.innerHTML = '<i class="fas fa-compress-alt"></i> Collapse';
    }
}