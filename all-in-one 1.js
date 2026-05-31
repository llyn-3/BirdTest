// 一体化实时视觉检测系统 - 完整版
// 包含所有功能和完整的暂停控制

class RealTimeDoveDetector {
    constructor() {
        this.model = null;
        this.isModelLoaded = false;
        this.isDetecting = false;
        this.isPaused = false;
        this.detectionInterval = null;
        this.videoElement = null;
        this.canvasElement = null;
        this.canvasContext = null;

        // 配置
        this.config = {
            confidenceThreshold: 0.4,
            iouThreshold: 0.45,
            maxDetections: 20,
            targetClasses: ['bird', 'dove', 'pigeon'],
            colors: {
                bird: '#3498db',
                dove: '#2ecc71',
                pigeon: '#e74c3c',
                default: '#f39c12'
            },
            fps: 10
        };

        // 狀態
        this.stats = {
            totalDetections: 0,
            currentDetections: 0,
            fps: 0,
            lastFrameTime: 0,
            detectionTime: 0,
            pausedTime: 0
        };

        // 檢測歷史
        this.detectionHistory = [];
        this.trailHistory = {};
        this.lastPauseTime = 0;
        this.pauseStartTime = 0;
    }

    // 初始化系統
    async init() {
        console.log('🕊️ 珠颈斑鸠实时检测系统初始化...');

        this.canvasElement = document.getElementById('video-canvas');
        if (!this.canvasElement) {
            console.error('找不到视频画布元素');
            return false;
        }

        this.canvasContext = this.canvasElement.getContext('2d');
        await this.loadModel();
        this.setupEventListeners();
        this.updateUI();

        console.log('✅ 系统初始化完成');
        return true;
    }

    // 加載AI模型
    async loadModel() {
        try {
            console.log('正在加载AI检测模型...');
            await this.loadTensorFlow();
            await this.loadCocoSsdModel();
            this.isModelLoaded = true;
            console.log('✅ AI模型加载成功');
            this.showToast('AI模型已加载', 'success');
        } catch (error) {
            console.error('模型加载失败:', error);
            this.showToast('使用模拟检测模式', 'warning');
            this.fallbackToSimulation();
        }
    }

    async loadTensorFlow() {
        if (typeof tf === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@4.10.0/dist/tf.min.js';
            document.head.appendChild(script);
            await new Promise((resolve, reject) => {
                script.onload = resolve;
                script.onerror = reject;
            });
        }
    }

    async loadCocoSsdModel() {
        const modelUrl = 'https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd@2.2.2';
        const script = document.createElement('script');
        script.src = `${modelUrl}/dist/coco-ssd.min.js`;
        document.head.appendChild(script);
        await new Promise((resolve, reject) => {
            script.onload = () => {
                window.cocoSsd.load().then(model => {
                    this.model = model;
                    resolve();
                }).catch(reject);
            };
            script.onerror = reject;
        });
    }

    fallbackToSimulation() {
        console.log('使用模拟检测模式');
        this.model = {
            detect: async (img) => {
                return this.generateMockDetections();
            }
        };
        this.isModelLoaded = true;
    }

    // ========== 核心检测功能 ==========

    async start() {
        if (!this.isModelLoaded) {
            this.showToast('AI模型未加载', 'error');
            return false;
        }

        if (this.isDetecting && !this.isPaused) {
            this.showToast('检测已在运行中', 'warning');
            return false;
        }

        if (this.isPaused) {
            return this.resume();
        }

        const stream = await this.getCameraStream();
        if (!stream) {
            this.showToast('无法访问摄像头', 'error');
            return false;
        }

        this.videoElement = document.createElement('video');
        this.videoElement.srcObject = stream;
        this.videoElement.playsInline = true;
        this.videoElement.muted = true;

        await new Promise((resolve) => {
            this.videoElement.onloadedmetadata = () => {
                this.videoElement.play();
                resolve();
            };
        });

        this.canvasElement.width = this.videoElement.videoWidth;
        this.canvasElement.height = this.videoElement.videoHeight;

        this.isDetecting = true;
        this.isPaused = false;
        this.startDetectionLoop();

        this.updateControlButtons();
        this.updatePauseUI(false);

        console.log('🚀 实时检测已开始');
        this.showToast('检测已开始', 'success');
        this.addLog('检测系统', 'success', '开始实时检测');

        return true;
    }

    startDetectionLoop() {
        this.detectionInterval = setInterval(() => {
            this.detectFrame();
        }, 1000 / this.config.fps);
    }

    async detectFrame() {
        if (!this.videoElement || !this.canvasContext || this.isPaused) return;

        const startTime = performance.now();

        try {
            this.drawVideoFrame();
            const detections = await this.model.detect(this.videoElement);
            this.processDetections(detections);
            this.updateFPS(startTime);
            this.stats.detectionTime++;
        } catch (error) {
            console.error('检测失败:', error);
        }
    }

    drawVideoFrame() {
        if (!this.videoElement || !this.canvasContext) return;
        this.canvasContext.drawImage(
            this.videoElement,
            0, 0,
            this.canvasElement.width,
            this.canvasElement.height
        );
    }

    processDetections(detections) {
        const birdDetections = detections.filter(det => {
            const isBird = det.class.toLowerCase().includes('bird') ||
                det.class.toLowerCase().includes('dove') ||
                det.class.toLowerCase().includes('pigeon');
            return isBird && det.score >= this.config.confidenceThreshold;
        });

        this.updateStatistics(birdDetections);
        this.drawDetections(birdDetections);
        this.saveDetectionRecord(birdDetections);
    }

    updateStatistics(detections) {
        this.stats.currentDetections = detections.length;
        this.stats.totalDetections += detections.length;
        this.updateUI();
    }

    drawDetections(detections) {
        const ctx = this.canvasContext;
        detections.forEach((det, index) => {
            const [x, y, width, height] = det.bbox;
            const className = det.class;
            const confidence = det.score;

            let color = this.config.colors.default;
            if (className.toLowerCase().includes('dove')) {
                color = this.config.colors.dove;
            } else if (className.toLowerCase().includes('pigeon')) {
                color = this.config.colors.pigeon;
            } else if (className.toLowerCase().includes('bird')) {
                color = this.config.colors.bird;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x, y, width, height);

            const label = `${className} ${(confidence * 100).toFixed(1)}%`;
            const textWidth = ctx.measureText(label).width;

            ctx.fillStyle = color;
            ctx.fillRect(x, y - 25, textWidth + 10, 25);

            ctx.fillStyle = 'white';
            ctx.font = '14px Arial';
            ctx.fillText(label, x + 5, y - 8);

            const centerX = x + width / 2;
            const centerY = y + height / 2;

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
            ctx.fill();

            this.saveTrail(index, { x: centerX, y: centerY });
        });

        this.drawTrails();
    }

    saveTrail(id, point) {
        if (!this.trailHistory[id]) {
            this.trailHistory[id] = [];
        }
        this.trailHistory[id].push(point);
        if (this.trailHistory[id].length > 20) {
            this.trailHistory[id].shift();
        }
    }

    drawTrails() {
        const ctx = this.canvasContext;
        const showTrails = document.getElementById('show-trails')?.checked ?? true;
        if (!showTrails) return;

        ctx.strokeStyle = 'rgba(52, 152, 219, 0.6)';
        ctx.lineWidth = 2;

        Object.values(this.trailHistory).forEach(trail => {
            if (trail.length < 2) return;
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) {
                ctx.lineTo(trail[i].x, trail[i].y);
            }
            ctx.stroke();
        });
    }

    updateFPS(startTime) {
        const currentTime = performance.now();
        const frameTime = currentTime - startTime;
        this.stats.fps = 1000 / frameTime;
    }

    saveDetectionRecord(detections) {
        if (detections.length === 0) return;

        const record = {
            timestamp: new Date().toLocaleTimeString(),
            count: detections.length,
            total: this.stats.totalDetections,
            fps: this.stats.fps.toFixed(1),
            detectionTime: this.stats.detectionTime,
            details: detections.map(d => ({
                class: d.class,
                confidence: d.score,
                bbox: d.bbox
            }))
        };

        this.detectionHistory.push(record);
        if (this.detectionHistory.length > 100) {
            this.detectionHistory.shift();
        }

        if (window.updateCharts) {
            window.updateCharts(this.detectionHistory);
        }
    }

    // ========== 暫停功能 ==========

    pause() {
        if (!this.isDetecting || this.isPaused) {
            this.showToast('檢測未運行或已暫停', 'warning');
            return false;
        }

        this.isPaused = true;
        this.pauseStartTime = Date.now();

        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        if (this.videoElement && !this.videoElement.paused) {
            this.videoElement.pause();
        }

        this.updatePauseUI(true);
        this.addPauseOverlay();

        console.log('⏸️ 检测已暂停');
        this.showToast('检测已暂停', 'info');
        this.addLog('检测系统', 'info', '检测已暂停');

        return true;
    }

    resume() {
        if (!this.isDetecting || !this.isPaused) {
            this.showToast('檢測未暫停', 'warning');
            return false;
        }

        this.isPaused = false;

        if (this.pauseStartTime > 0) {
            const pauseDuration = Date.now() - this.pauseStartTime;
            this.stats.pausedTime += pauseDuration;
            this.pauseStartTime = 0;
        }

        if (this.videoElement && this.videoElement.paused) {
            this.videoElement.play().catch(error => {
                console.error('視頻播放恢復失敗:', error);
            });
        }

        this.startDetectionLoop();
        this.updatePauseUI(false);
        this.removePauseOverlay();

        console.log('▶️ 检测已恢复');
        this.showToast('检测已恢复', 'success');
        this.addLog('检测系统', 'info', '检测已恢复');

        return true;
    }

    togglePause() {
        if (!this.isDetecting) {
            this.showToast('請先開始檢測', 'warning');
            return false;
        }

        if (this.isPaused) {
            return this.resume();
        } else {
            return this.pause();
        }
    }

    updatePauseUI(paused) {
        const pauseBtn = document.getElementById('pause-btn');
        const pauseIcon = document.getElementById('pause-icon');
        const pauseText = document.getElementById('pause-text');

        if (pauseBtn) {
            if (paused) {
                pauseBtn.classList.add('paused-btn');
                pauseBtn.classList.remove('warning');
                pauseBtn.innerHTML = '<i class="fas fa-play" id="pause-icon"></i><span id="pause-text">恢复检测</span>';
            } else {
                pauseBtn.classList.remove('paused-btn');
                pauseBtn.classList.add('warning');
                pauseBtn.innerHTML = '<i class="fas fa-pause" id="pause-icon"></i><span id="pause-text">暂停检测</span>';
            }
            pauseBtn.disabled = !this.isDetecting;
        }

        this.updateStatusIndicator(paused ? 'paused' : 'online');
        this.updateElement('overlay-status', paused ? '已暂停' : '运行中');
        this.updateElement('overlay-status-icon', paused ? '⏸️' : '▶️');
        this.updateControlButtons();
    }

    updateControlButtons() {
        const startBtn = document.getElementById('start-btn');
        const pauseBtn = document.getElementById('pause-btn');
        const stopBtn = document.getElementById('stop-btn');

        if (this.isDetecting) {
            if (startBtn) startBtn.disabled = true;
            if (pauseBtn) pauseBtn.disabled = false;
            if (stopBtn) stopBtn.disabled = false;

            if (this.isPaused) {
                if (pauseBtn) {
                    pauseBtn.classList.remove('warning');
                    pauseBtn.classList.add('success');
                }
            } else {
                if (pauseBtn) {
                    pauseBtn.classList.remove('success');
                    pauseBtn.classList.add('warning');
                }
            }
        } else {
            if (startBtn) startBtn.disabled = false;
            if (pauseBtn) pauseBtn.disabled = true;
            if (stopBtn) stopBtn.disabled = true;

            if (pauseBtn) {
                pauseBtn.classList.remove('success', 'warning');
                pauseBtn.classList.add('warning');
            }
        }
    }

    addPauseOverlay() {
        this.removePauseOverlay();

        const canvas = this.canvasElement;
        if (!canvas) return;

        const overlay = document.createElement('div');
        overlay.id = 'pause-overlay';
        overlay.className = 'pause-overlay';
        overlay.innerHTML = `
            <div class="pause-content">
                <i class="fas fa-pause-circle"></i>
                <h3>检测已暂停</h3>
                <p>系统暂停中，点击"恢复检测"按钮继续</p>
                <div class="pause-shortcuts">
                    <div class="shortcut-item">
                        <span class="shortcut-key">空格键</span>
                        <span class="shortcut-text">恢复/暂停</span>
                    </div>
                    <div class="shortcut-item">
                        <span class="shortcut-key">ESC</span>
                        <span class="shortcut-text">停止检测</span>
                    </div>
                </div>
            </div>
        `;

        const container = canvas.parentElement;
        if (container && container.style.position !== 'relative') {
            container.style.position = 'relative';
        }

        container.appendChild(overlay);

        overlay.addEventListener('click', () => {
            if (this.isDetecting && this.isPaused) {
                this.resume();
            }
        });
    }

    removePauseOverlay() {
        const overlay = document.getElementById('pause-overlay');
        if (overlay && overlay.parentElement) {
            overlay.parentElement.removeChild(overlay);
        }
    }

    // ========== 系統控制功能 ==========

    stop() {
        if (!this.isDetecting) return;

        this.isDetecting = false;
        this.isPaused = false;

        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }

        if (this.videoElement && this.videoElement.srcObject) {
            this.videoElement.srcObject.getTracks().forEach(track => track.stop());
            this.videoElement.remove();
            this.videoElement = null;
        }

        this.removePauseOverlay();
        this.updateControlButtons();
        this.updatePauseUI(false);
        this.updateStatusIndicator('offline');

        console.log('🛑 检测已停止');
        this.showToast('检测已停止', 'info');
        this.addLog('检测系统', 'info', '检测已停止');
    }

    reset() {
        this.stop();
        this.stats = {
            totalDetections: 0,
            currentDetections: 0,
            fps: 0,
            lastFrameTime: 0,
            detectionTime: 0,
            pausedTime: 0
        };
        this.detectionHistory = [];
        this.trailHistory = {};

        if (this.canvasContext) {
            this.canvasContext.clearRect(0, 0,
                this.canvasElement.width,
                this.canvasElement.height
            );
        }

        this.updateUI();
        this.showToast('系统已重置', 'info');
    }

    // ========== UI更新功能 ==========

    updateUI() {
        this.updateElement('stat-total', this.stats.totalDetections);
        this.updateElement('stat-current', this.stats.currentDetections);
        this.updateElement('stat-fps', this.stats.fps.toFixed(1) + ' FPS');

        const detectionTimeStr = this.formatTime(this.stats.detectionTime);
        this.updateElement('stat-runtime', detectionTimeStr);

        this.updateElement('overlay-total', this.stats.totalDetections);
        this.updateElement('overlay-current', this.stats.currentDetections);
        this.updateElement('overlay-fps', this.stats.fps.toFixed(1));
        this.updateElement('detection-count', this.stats.currentDetections);
        this.updateElement('overlay-time', new Date().toLocaleTimeString());
    }

    updateElement(id, value) {
        const element = document.getElementById(id);
        if (element) {
            element.textContent = value;
        }
    }

    updateStatusIndicator(status) {
        const indicator = document.getElementById('status-indicator');
        const statusText = document.getElementById('connection-status');
        const footerStatus = document.getElementById('footer-status');

        if (indicator) indicator.className = `status ${status}`;
        if (statusText) {
            let displayText = '';
            switch (status) {
                case 'online': displayText = '在线'; break;
                case 'offline': displayText = '离线'; break;
                case 'paused': displayText = '已暂停'; break;
                case 'connecting': displayText = '连接中'; break;
                default: displayText = status;
            }
            statusText.textContent = displayText;
        }
        if (footerStatus) {
            footerStatus.textContent = status === 'online' ? '运行中' :
                status === 'paused' ? '已暂停' : '离线';
        }
    }

    // ========== 事件監聽器 ==========

    setupEventListeners() {
        document.getElementById('start-btn')?.addEventListener('click', () => this.start());
        document.getElementById('pause-btn')?.addEventListener('click', () => this.togglePause());
        document.getElementById('stop-btn')?.addEventListener('click', () => this.stop());
        document.getElementById('snapshot-btn')?.addEventListener('click', () => this.takeSnapshot());
        document.getElementById('reset-btn')?.addEventListener('click', () => this.reset());
        document.getElementById('emergency-stop-btn')?.addEventListener('click', () => {
            if (confirm('確定要緊急停止所有檢測嗎？')) {
                this.stop();
                this.showToast('系統已緊急停止', 'warning');
            }
        });

        const options = ['show-boxes', 'show-trails', 'show-labels', 'show-confidence'];
        options.forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => {
                this.redrawDetections();
            });
        });

        document.addEventListener('keydown', (event) => {
            if (event.code === 'Space' && this.isDetecting) {
                event.preventDefault();
                this.togglePause();
            }
            if (event.code === 'Escape' && this.isDetecting) {
                this.stop();
            }
            if (event.code === 'Enter' && !this.isDetecting) {
                this.start();
            }
            if (event.code === 'KeyS' && this.isDetecting) {
                this.takeSnapshot();
            }
        });

        this.canvasElement?.addEventListener('dblclick', () => {
            if (this.isDetecting) {
                this.togglePause();
            }
        });
    }

    // ========== 工具函數 ==========

    async getCameraStream() {
        try {
            const constraints = {
                video: {
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                    facingMode: 'environment'
                }
            };
            return await navigator.mediaDevices.getUserMedia(constraints);
        } catch (error) {
            console.error('无法访问摄像头:', error);
            return null;
        }
    }

    takeSnapshot() {
        if (!this.canvasElement) return;
        const link = document.createElement('a');
        link.download = `dove_detection_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
        link.href = this.canvasElement.toDataURL('image/png');
        link.click();
        this.showToast('快照已保存', 'success');
    }

    generateMockDetections() {
        const classes = ['bird', 'dove', 'pigeon', 'sparrow'];
        const count = Math.floor(Math.random() * 4) + 1;
        const detections = [];

        for (let i = 0; i < count; i++) {
            const className = classes[Math.floor(Math.random() * classes.length)];
            const confidence = 0.6 + Math.random() * 0.4;
            const width = this.canvasElement.width;
            const height = this.canvasElement.height;

            const bboxWidth = 80 + Math.random() * 60;
            const bboxHeight = 60 + Math.random() * 40;
            const bboxX = Math.random() * (width - bboxWidth);
            const bboxY = Math.random() * (height - bboxHeight);

            detections.push({
                bbox: [bboxX, bboxY, bboxWidth, bboxHeight],
                class: className,
                score: confidence
            });
        }

        return detections;
    }

    redrawDetections() {
        if (this.videoElement) {
            this.drawVideoFrame();
        }
    }

    showToast(message, type = 'info') {
        console.log(`[${type.toUpperCase()}] ${message}`);

        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `
            <i class="fas ${this.getIconForType(type)}"></i>
            <span>${message}</span>
            <button class="toast-close">&times;</button>
        `;

        let container = document.getElementById('toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container';
            document.body.appendChild(container);
        }

        container.appendChild(toast);

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        }, 3000);

        toast.querySelector('.toast-close').addEventListener('click', () => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (toast.parentNode) toast.parentNode.removeChild(toast);
            }, 300);
        });
    }

    getIconForType(type) {
        switch (type) {
            case 'success': return 'fa-check-circle';
            case 'error': return 'fa-exclamation-circle';
            case 'warning': return 'fa-exclamation-triangle';
            default: return 'fa-info-circle';
        }
    }

    addLog(module, level, message) {
        const timestamp = new Date().toLocaleTimeString();
        console.log(`[${module}] ${message}`);
        if (window.addLog) {
            window.addLog(module, level, message);
        }
    }

    formatTime(seconds) {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hrs > 0) {
            return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
        }
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }

    getStatistics() {
        return {
            ...this.stats,
            modelLoaded: this.isModelLoaded,
            isDetecting: this.isDetecting,
            isPaused: this.isPaused
        };
    }

    exportData() {
        const data = {
            timestamp: new Date().toISOString(),
            stats: this.stats,
            history: this.detectionHistory,
            config: this.config
        };

        const blob = new Blob([JSON.stringify(data, null, 2)],
            { type: 'application/json' });
        const link = document.createElement('a');
        link.download = `dove_detection_data_${new Date().toISOString().slice(0, 10)}.json`;
        link.href = URL.createObjectURL(blob);
        link.click();
        this.showToast('数据已导出', 'success');
    }
}

// 全局实例
window.DoveDetector = new RealTimeDoveDetector();

// 初始化函数
async function initDoveDetector() {
    try {
        await window.DoveDetector.init();
        document.getElementById('start-btn').disabled = false;
        document.getElementById('start-btn').innerHTML = '<i class="fas fa-play"></i> 开始实时检测';
        console.log('🎉 珠颈斑鸠检测系统准备就绪！');
        return true;
    } catch (error) {
        console.error('初始化失败:', error);
        return false;
    }
}

// DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🌐 页面加载完成，正在初始化检测系统...');

    const loadingScreen = document.getElementById('loading');
    if (loadingScreen) {
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.style.display = 'none';
            }, 500);
        }, 1000);
    }

    setTimeout(async () => {
        await initDoveDetector();
    }, 500);
});