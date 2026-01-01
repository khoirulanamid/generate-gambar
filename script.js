// ===== WHISK AI IMAGE GENERATOR - CORE APPLICATION =====

class WhiskImageGenerator {
    constructor() {
        // API Configuration
        this.whiskApiUrl = 'https://aisandbox-pa.googleapis.com/v1/whisk:generateImage';
        this.upscaleUploadUrl = 'https://get1.imglarger.com/api/UpscalerNew/UploadNew';
        this.upscaleStatusUrl = 'https://get1.imglarger.com/api/UpscalerNew/CheckStatusNew';

        // State
        this.bearerToken = '';
        this.concurrentLimit = 2;
        this.autoUpscale = true;
        this.queue = [];
        this.activeJobs = 0;
        this.completedJobs = 0;
        this.totalJobs = 0;
        this.isGenerating = false;
        this.generatedImages = [];
        this.indexOffset = 0; // For appending new images

        // Aspect Ratio Configuration
        this.aspectRatioConfig = {
            auto: {
                keywords: {
                    landscape: ['landscape', 'wide', 'panorama', 'background', 'cover', 'wallpaper', 'thumbnail', 'banner', 'hero'],
                    portrait: ['portrait', 'vertical', 'tall', 'full body', 'poster', 'mobile', 'reels', 'shorts', 'story', 'instagram', 'editorial', 'magazine'],
                    square: ['square', 'icon', 'logo', 'avatar', 'sticker', 'profile']
                }
            },
            square: { enum: 'IMAGE_ASPECT_RATIO_SQUARE', width: 3000, height: 3000 },
            landscape: { enum: 'IMAGE_ASPECT_RATIO_LANDSCAPE', width: 3840, height: 2160 },
            portrait: { enum: 'IMAGE_ASPECT_RATIO_PORTRAIT', width: 2160, height: 3840 }
        };

        // Support Prompt Configuration - Auto-enhance prompts for better quality
        this.supportPromptEnabled = true;
        this.supportPrompt = {
            // Quality enhancers added to every prompt
            quality: [
                'masterpiece',
                'best quality',
                'highly detailed',
                'ultra-detailed',
                '8K resolution'
            ],
            // Style enhancers
            style: [
                'professional photography',
                'stunning composition',
                'perfect lighting',
                'sharp focus'
            ],
            // Technical enhancers
            technical: [
                'high dynamic range',
                'photorealistic',
                'cinematic'
            ],
            // No text/watermark - prevent any text in image
            noText: [
                'no text',
                'no letters',
                'no words',
                'no watermark',
                'no signature',
                'no writing',
                'text-free',
                'clean image'
            ],
            // Negative prompt keywords (things to avoid)
            negative: [
                'blurry',
                'low quality',
                'distorted',
                'deformed',
                'ugly',
                'bad anatomy'
            ]
        };

        // DOM Elements
        this.elements = {
            promptInput: document.getElementById('promptInput'),
            generateBtn: document.getElementById('generateBtn'),
            generateText: document.getElementById('generateText'),
            fileInput: document.getElementById('fileInput'),
            aspectRatio: document.getElementById('aspectRatio'),
            promptCount: document.getElementById('promptCount'),
            progressSection: document.getElementById('progressSection'),
            progressBar: document.getElementById('progressBar'),
            progressStatus: document.getElementById('progressStatus'),
            completedCount: document.getElementById('completedCount'),
            totalCount: document.getElementById('totalCount'),
            galleryGrid: document.getElementById('galleryGrid'),
            galleryEmpty: document.getElementById('galleryEmpty'),
            clearQueueBtn: document.getElementById('clearQueueBtn'),
            downloadAllBtn: document.getElementById('downloadAllBtn'),
            clearGalleryBtn: document.getElementById('clearGalleryBtn'),
            settingsBtn: document.getElementById('settingsBtn'),
            settingsModal: document.getElementById('settingsModal'),
            closeSettings: document.getElementById('closeSettings'),
            bearerToken: document.getElementById('bearerToken'),
            togglePassword: document.getElementById('togglePassword'),
            concurrentLimit: document.getElementById('concurrentLimit'),
            autoUpscale: document.getElementById('autoUpscale'),
            saveSettings: document.getElementById('saveSettings'),
            statusIndicator: document.getElementById('statusIndicator'),
            toastContainer: document.getElementById('toastContainer')
        };

        this.init();
    }

    init() {
        this.loadSettings();
        this.bindEvents();
        this.updatePromptCount();
    }

    // ===== Settings Management =====
    loadSettings() {
        const settings = JSON.parse(localStorage.getItem('whiskSettings') || '{}');
        this.bearerToken = settings.bearerToken || '';
        this.concurrentLimit = settings.concurrentLimit || 2;
        this.autoUpscale = settings.autoUpscale !== false;

        this.elements.bearerToken.value = this.bearerToken;
        this.elements.concurrentLimit.value = this.concurrentLimit;
        this.elements.autoUpscale.checked = this.autoUpscale;
    }

    saveSettings() {
        this.bearerToken = this.elements.bearerToken.value.trim();
        this.concurrentLimit = parseInt(this.elements.concurrentLimit.value);
        this.autoUpscale = this.elements.autoUpscale.checked;

        localStorage.setItem('whiskSettings', JSON.stringify({
            bearerToken: this.bearerToken,
            concurrentLimit: this.concurrentLimit,
            autoUpscale: this.autoUpscale
        }));

        this.showToast('Settings saved successfully!', 'success');
        this.closeSettingsModal();
    }

    // ===== Event Bindings =====
    bindEvents() {
        // Settings Modal
        this.elements.settingsBtn.addEventListener('click', () => this.openSettingsModal());
        this.elements.closeSettings.addEventListener('click', () => this.closeSettingsModal());
        this.elements.settingsModal.addEventListener('click', (e) => {
            if (e.target === this.elements.settingsModal) this.closeSettingsModal();
        });
        this.elements.saveSettings.addEventListener('click', () => this.saveSettings());
        this.elements.togglePassword.addEventListener('click', () => this.togglePasswordVisibility());

        // Prompt Input
        this.elements.promptInput.addEventListener('input', () => this.updatePromptCount());
        this.elements.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));

        // Generate Button
        this.elements.generateBtn.addEventListener('click', () => this.startGeneration());
        this.elements.clearQueueBtn.addEventListener('click', () => this.stopAllJobs());

        // Gallery Actions
        this.elements.downloadAllBtn.addEventListener('click', () => this.downloadAllImages());
        this.elements.clearGalleryBtn.addEventListener('click', () => this.clearGallery());

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.key === 'Enter') {
                this.startGeneration();
            }
            if (e.key === 'Escape' && this.elements.settingsModal.classList.contains('active')) {
                this.closeSettingsModal();
            }
        });

        // Tab Navigation
        document.querySelectorAll('.tab-item').forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });
    }

    // ===== Tab Switching =====
    switchTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('.tab-item').forEach(item => {
            item.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Update tab content
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`tab-${tabName}`).classList.add('active');
    }

    // ===== Modal Controls =====
    openSettingsModal() {
        this.elements.settingsModal.classList.add('active');
    }

    closeSettingsModal() {
        this.elements.settingsModal.classList.remove('active');
    }

    togglePasswordVisibility() {
        const input = this.elements.bearerToken;
        const btn = this.elements.togglePassword;
        if (input.type === 'password') {
            input.type = 'text';
            btn.textContent = '🙈';
        } else {
            input.type = 'password';
            btn.textContent = '👁️';
        }
    }

    // ===== File Upload =====
    handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const content = event.target.result;
            const lines = content.split('\n').filter(line => line.trim());

            if (this.elements.promptInput.value.trim()) {
                this.elements.promptInput.value += '\n' + lines.join('\n');
            } else {
                this.elements.promptInput.value = lines.join('\n');
            }

            this.updatePromptCount();
            this.showToast(`Loaded ${lines.length} prompts from file`, 'success');
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset file input
    }

    // ===== Prompt Management =====
    updatePromptCount() {
        const prompts = this.getPrompts();
        this.elements.promptCount.textContent = prompts.length;
        this.elements.generateText.textContent = prompts.length > 1
            ? `Generate ${prompts.length} Images`
            : 'Generate';
    }

    getPrompts() {
        return this.elements.promptInput.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    }

    // ===== Support Prompt Enhancement =====
    enhancePrompt(originalPrompt) {
        if (!this.supportPromptEnabled) {
            return originalPrompt;
        }

        // Build quality suffix
        const qualityTags = this.supportPrompt.quality.join(', ');
        const styleTags = this.supportPrompt.style.join(', ');
        const technicalTags = this.supportPrompt.technical.join(', ');
        const noTextTags = this.supportPrompt.noText.join(', ');

        // Combine original prompt with quality enhancers + no text
        const enhancedPrompt = `${originalPrompt}, ${qualityTags}, ${styleTags}, ${technicalTags}, ${noTextTags}`;

        return enhancedPrompt;
    }

    // ===== Aspect Ratio Detection =====
    detectAspectRatio(prompt) {
        const selectedRatio = this.elements.aspectRatio.value;

        if (selectedRatio !== 'auto') {
            return this.aspectRatioConfig[selectedRatio];
        }

        const promptLower = prompt.toLowerCase();
        const keywords = this.aspectRatioConfig.auto.keywords;

        if (keywords.landscape.some(kw => promptLower.includes(kw))) {
            return this.aspectRatioConfig.landscape;
        }
        if (keywords.portrait.some(kw => promptLower.includes(kw))) {
            return this.aspectRatioConfig.portrait;
        }
        return this.aspectRatioConfig.square;
    }

    // ===== Generation Flow =====
    async startGeneration() {
        if (!this.bearerToken) {
            this.showToast('Please set your bearer token in Settings first!', 'error');
            this.openSettingsModal();
            return;
        }

        const prompts = this.getPrompts();
        if (prompts.length === 0) {
            this.showToast('Please enter at least one prompt', 'warning');
            return;
        }

        this.isGenerating = true;
        this.queue = [...prompts];
        this.activeJobs = 0;
        this.completedJobs = 0;
        this.totalJobs = prompts.length;

        // Calculate offset for new cards (keep existing images)
        const existingCards = this.elements.galleryGrid.querySelectorAll('.image-card').length;
        this.indexOffset = existingCards;

        // Update UI
        this.updateStatus('generating', 'Generating...');
        this.elements.generateBtn.classList.add('loading');
        this.elements.clearQueueBtn.style.display = 'flex';
        this.elements.progressSection.style.display = 'block';
        this.elements.galleryEmpty.style.display = 'none';
        this.elements.downloadAllBtn.style.display = 'flex';
        this.elements.clearGalleryBtn.style.display = 'flex';

        // Update progress
        this.updateProgress();

        // Create initial cards (with offset index to not conflict with existing)
        prompts.forEach((prompt, index) => {
            this.createImageCard(prompt, this.indexOffset + index);
        });

        // Start processing queue
        this.processQueue();
    }

    async processQueue() {
        while (this.queue.length > 0 && this.isGenerating) {
            if (this.activeJobs >= this.concurrentLimit) {
                await this.sleep(500);
                continue;
            }

            const prompt = this.queue.shift();
            // Use offset to match the correct card
            const index = this.indexOffset + (this.totalJobs - this.queue.length - 1);
            this.activeJobs++;

            this.generateImage(prompt, index);
        }
    }

    async generateImage(prompt, index) {
        const card = document.querySelector(`[data-index="${index}"]`);

        try {
            // Update card status
            this.updateCardStatus(card, 'generating', '🎨 Generating...');
            this.updateProgressStatus(`Generating image ${index + 1}...`);

            // Detect aspect ratio
            const aspectConfig = this.detectAspectRatio(prompt);

            // Enhance prompt with quality keywords
            const enhancedPrompt = this.enhancePrompt(prompt);
            console.log('Enhanced prompt:', enhancedPrompt);

            // Generate random seed
            const seed = Math.floor(Math.random() * 9999999) + 1;

            // Build request payload
            const payload = {
                clientContext: {
                    workflowId: '9248e624-9730-4c27-a8db-bc568687c24d',
                    tool: 'BACKBONE',
                    sessionId: String(Date.now())
                },
                imageModelSettings: {
                    imageModel: 'IMAGEN_3_5',
                    aspectRatio: aspectConfig.enum
                },
                mediaCategory: 'MEDIA_CATEGORY_BOARD',
                prompt: enhancedPrompt,
                seed: seed
            };

            // Make API request
            const response = await fetch(this.whiskApiUrl, {
                method: 'POST',
                headers: {
                    'Authorization': this.bearerToken.startsWith('Bearer ')
                        ? this.bearerToken
                        : `Bearer ${this.bearerToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Extract base64 image
            const base64Image = data?.imagePanels?.[0]?.generatedImages?.[0]?.encodedImage;
            if (!base64Image) {
                throw new Error('No image data received');
            }

            let finalImageUrl = `data:image/png;base64,${base64Image}`;
            let isUpscaled = false;

            // Auto upscale if enabled
            if (this.autoUpscale) {
                this.updateCardStatus(card, 'upscaling', '⬆️ Upscaling 4x...');
                this.updateProgressStatus(`Upscaling image ${index + 1}...`);

                try {
                    const upscaledUrl = await this.upscaleImage(base64Image);
                    if (upscaledUrl) {
                        finalImageUrl = upscaledUrl;
                        isUpscaled = true;
                    }
                } catch (upscaleError) {
                    console.warn('Upscale failed, using original:', upscaleError);
                    this.showToast(`Upscale failed for image ${index + 1}, using original`, 'warning');
                }
            }

            // Update card with final image
            this.updateCardImage(card, finalImageUrl, prompt, isUpscaled);
            this.updateCardStatus(card, 'complete', isUpscaled ? '✅ Upscaled' : '✅ Done');

            // Store image data
            this.generatedImages.push({
                prompt,
                url: finalImageUrl,
                index,
                isUpscaled
            });

            this.completedJobs++;
            this.updateProgress();

        } catch (error) {
            console.error('Generation error:', error);
            this.updateCardStatus(card, 'error', '❌ Error');
            this.showToast(`Failed: ${error.message}`, 'error');
            this.completedJobs++;
            this.updateProgress();
        }

        this.activeJobs--;

        // Check if all done
        if (this.completedJobs >= this.totalJobs) {
            this.finishGeneration();
        }
    }

    // ===== Upscaling =====
    async upscaleImage(base64Data) {
        // Convert base64 to blob
        const byteString = atob(base64Data);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
            ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/png' });

        // Upload to upscaler
        const formData = new FormData();
        formData.append('myfile', blob, 'image.png');
        formData.append('scaleRadio', '4');

        const uploadResponse = await fetch(this.upscaleUploadUrl, {
            method: 'POST',
            headers: {
                'Accept': 'application/json, text/plain, */*',
                'Origin': 'https://imgupscaler.com',
                'Referer': 'https://imgupscaler.com/'
            },
            body: formData
        });

        const uploadData = await uploadResponse.json();
        if (!uploadData?.data?.code) {
            throw new Error('Upload failed');
        }

        const code = uploadData.data.code;

        // Poll for completion
        let attempts = 0;
        const maxAttempts = 30;

        while (attempts < maxAttempts) {
            await this.sleep(15000); // Wait 15 seconds

            const statusResponse = await fetch(this.upscaleStatusUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ code, scaleRadio: 4 })
            });

            const statusData = await statusResponse.json();

            if (statusData?.data?.status === 'success' && statusData?.data?.downloadUrls?.[0]) {
                return statusData.data.downloadUrls[0];
            }

            attempts++;
        }

        throw new Error('Upscale timeout');
    }

    // ===== UI Updates =====
    createImageCard(prompt, index) {
        const card = document.createElement('div');
        card.className = 'image-card';
        card.dataset.index = index;

        card.innerHTML = `
            <div class="image-preview">
                <div class="image-placeholder">
                    <div class="loader"></div>
                    <span>Processing...</span>
                </div>
                <div class="image-status queued">⏳ In Queue</div>
            </div>
            <div class="image-info">
                <p class="image-prompt" title="${this.escapeHtml(prompt)}">${this.escapeHtml(prompt)}</p>
                <div class="image-actions">
                    <button class="btn btn-secondary btn-view" disabled>👁️ View</button>
                    <button class="btn btn-secondary btn-download" disabled>⬇️ Download</button>
                </div>
            </div>
        `;

        this.elements.galleryGrid.appendChild(card);
    }

    updateCardStatus(card, status, text) {
        if (!card) return;
        const statusEl = card.querySelector('.image-status');
        if (statusEl) {
            statusEl.className = `image-status ${status}`;
            statusEl.textContent = text;
        }
    }

    updateCardImage(card, imageUrl, prompt, isUpscaled) {
        if (!card) return;
        const previewEl = card.querySelector('.image-preview');
        const downloadBtn = card.querySelector('.btn-download');
        const viewBtn = card.querySelector('.btn-view');

        previewEl.innerHTML = `
            <img src="${imageUrl}" alt="${this.escapeHtml(prompt)}" loading="lazy">
            <div class="image-status complete">${isUpscaled ? '✅ 4x Upscaled' : '✅ Done'}</div>
        `;

        // Enable and bind View button
        viewBtn.disabled = false;
        viewBtn.addEventListener('click', () => this.openImageViewer(imageUrl, prompt));

        // Enable and bind Download button
        downloadBtn.disabled = false;
        downloadBtn.addEventListener('click', () => this.downloadImage(imageUrl, prompt));
    }

    // ===== Image Viewer (Lightbox) =====
    openImageViewer(imageUrl, prompt) {
        // Create lightbox overlay
        const lightbox = document.createElement('div');
        lightbox.className = 'lightbox-overlay';
        lightbox.innerHTML = `
            <div class="lightbox-content">
                <button class="lightbox-close">&times;</button>
                <img src="${imageUrl}" alt="${this.escapeHtml(prompt)}">
                <div class="lightbox-info">
                    <p class="lightbox-prompt">${this.escapeHtml(prompt)}</p>
                    <button class="btn btn-primary lightbox-download">⬇️ Download Full Size</button>
                </div>
            </div>
        `;

        document.body.appendChild(lightbox);
        document.body.style.overflow = 'hidden'; // Prevent scroll

        // Animate in
        setTimeout(() => lightbox.classList.add('active'), 10);

        // Close handlers
        const closeBtn = lightbox.querySelector('.lightbox-close');
        const downloadBtn = lightbox.querySelector('.lightbox-download');

        closeBtn.addEventListener('click', () => this.closeLightbox(lightbox));
        lightbox.addEventListener('click', (e) => {
            if (e.target === lightbox) this.closeLightbox(lightbox);
        });
        downloadBtn.addEventListener('click', () => this.downloadImage(imageUrl, prompt));

        // ESC key to close
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                this.closeLightbox(lightbox);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    }

    closeLightbox(lightbox) {
        lightbox.classList.remove('active');
        document.body.style.overflow = '';
        setTimeout(() => lightbox.remove(), 300);
    }

    updateProgress() {
        const percentage = (this.completedJobs / this.totalJobs) * 100;
        this.elements.progressBar.style.width = `${percentage}%`;
        this.elements.completedCount.textContent = this.completedJobs;
        this.elements.totalCount.textContent = this.totalJobs;
    }

    updateProgressStatus(text) {
        this.elements.progressStatus.textContent = text;
    }

    updateStatus(status, text) {
        const indicator = this.elements.statusIndicator;
        const dot = indicator.querySelector('.status-dot');
        const statusText = indicator.querySelector('.status-text');

        indicator.style.background = status === 'generating'
            ? 'rgba(59, 130, 246, 0.1)'
            : 'rgba(16, 185, 129, 0.1)';
        indicator.style.borderColor = status === 'generating'
            ? 'rgba(59, 130, 246, 0.3)'
            : 'rgba(16, 185, 129, 0.3)';

        dot.style.background = status === 'generating' ? '#3b82f6' : '#10b981';
        statusText.style.color = status === 'generating' ? '#3b82f6' : '#10b981';
        statusText.textContent = text;
    }

    finishGeneration() {
        this.isGenerating = false;
        this.updateStatus('ready', 'Ready');
        this.elements.generateBtn.classList.remove('loading');
        this.elements.clearQueueBtn.style.display = 'none';
        this.updateProgressStatus('All images generated!');
        this.showToast(`Successfully generated ${this.completedJobs} images!`, 'success');
    }

    stopAllJobs() {
        this.isGenerating = false;
        this.queue = [];
        this.finishGeneration();
        this.showToast('Generation stopped', 'warning');
    }

    // ===== Download Functions =====
    async downloadImage(url, prompt) {
        try {
            const filename = this.generateFilename(prompt);

            if (url.startsWith('data:')) {
                // Base64 image
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                link.click();
            } else {
                // External URL - fetch and download
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);

                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = filename;
                link.click();

                URL.revokeObjectURL(blobUrl);
            }

            this.showToast('Image downloaded!', 'success');
        } catch (error) {
            console.error('Download error:', error);
            this.showToast('Download failed', 'error');
        }
    }

    async downloadAllImages() {
        if (this.generatedImages.length === 0) {
            this.showToast('No images to download', 'warning');
            return;
        }

        this.showToast(`Downloading ${this.generatedImages.length} images...`, 'info');

        for (let i = 0; i < this.generatedImages.length; i++) {
            const img = this.generatedImages[i];
            await this.downloadImage(img.url, img.prompt);
            await this.sleep(500); // Small delay between downloads
        }
    }

    generateFilename(prompt) {
        const slug = prompt
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 50);

        const timestamp = Date.now();
        return `whisk_${slug}_${timestamp}.png`;
    }

    clearGallery() {
        this.elements.galleryGrid.innerHTML = '';
        this.elements.galleryEmpty.style.display = 'flex';
        this.elements.galleryGrid.appendChild(this.elements.galleryEmpty);
        this.elements.downloadAllBtn.style.display = 'none';
        this.elements.clearGalleryBtn.style.display = 'none';
        this.elements.progressSection.style.display = 'none';
        this.generatedImages = [];
        this.showToast('Gallery cleared', 'success');
    }

    // ===== Toast Notifications =====
    showToast(message, type = 'info') {
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span class="toast-icon">${icons[type]}</span>
            <span class="toast-message">${message}</span>
        `;

        this.elements.toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // ===== Utility Functions =====
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize application
document.addEventListener('DOMContentLoaded', () => {
    window.whiskApp = new WhiskImageGenerator();
});
