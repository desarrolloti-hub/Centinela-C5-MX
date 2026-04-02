// =============================================
// SISTEMA DE PARTÍCULAS ANIMADAS
// Tema Único: Naranja Fire - Con todos los estilos completos
// =============================================

// Importar UserManager
import { UserManager } from '/clases/user.js';

class ParticleSystem {
    constructor() {
        this.canvas = null;
        this.ctx = null;
        this.particles = [];
        this.userManager = null;
        this.currentTheme = null;
        this.animationId = null;
        this.primaryColor = 'rgba(255, 102, 0, 0.8)';
        this.secondaryColor = 'rgba(255, 136, 51, 0.8)';
        this.lastDatabaseCheck = 0;
        this.databaseCheckInterval = 3600000;

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        try {
            this.injectStyles();
            this.canvas = document.getElementById("particle-canvas");
            if (!this.canvas) {
                console.warn("⚠️ Canvas de partículas no encontrado");
                return;
            }

            this.ctx = this.canvas.getContext("2d");
            document.body.classList.add('particulas-active');
            this.resizeCanvas();

            if (!window.userManager) {
                this.userManager = new UserManager();
                window.userManager = this.userManager;
            } else {
                this.userManager = window.userManager;
            }

            const loadedFromLocal = await this.loadFromLocalStorage();
            const now = Date.now();
            const shouldCheckDatabase = !loadedFromLocal ||
                (now - this.lastDatabaseCheck) > this.databaseCheckInterval;

            if (shouldCheckDatabase) {
                await this.loadColorsFromDatabase();
                this.lastDatabaseCheck = now;
            }

            if (!this.currentTheme) {
                this.useDefaultColors();
            }

            this.createParticles();
            this.animate();
            this.setupEventListeners();

        } catch (error) {
            console.error('❌ Error:', error);
            this.useDefaultColors();
            this.createParticles();
            this.animate();
        }
    }

    injectStyles() {
        if (document.querySelector('style[data-particle-styles]')) return;

        const style = document.createElement('style');
        style.setAttribute('data-particle-styles', 'true');
        style.textContent = `
            body.particulas-active {
                margin: 0;
                background-color: var(--color-bg-primary, #000000);
            }
            
            #particle-canvas {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: -1;
            }
            
            .login-container {
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                color: var(--color-text-primary, white);
                text-align: center;
            }
            
            .form-box {
                background: rgba(12, 12, 30, 0.7);
                padding: 30px 40px;
                border-radius: 8px;
                border: 1px solid var(--color-accent-primary, rgba(255, 102, 0, 0.4));
                backdrop-filter: blur(5px);
            }
        `;
        document.head.appendChild(style);
    }

    async loadFromLocalStorage() {
        try {
            const savedParticleColors = localStorage.getItem('particle-colors');
            if (savedParticleColors) {
                const colors = JSON.parse(savedParticleColors);
                if (colors && colors.primary && colors.secondary) {
                    const maxAge = 24 * 60 * 60 * 1000;
                    if (!colors.timestamp || (Date.now() - colors.timestamp) < maxAge) {
                        this.primaryColor = colors.primary;
                        this.secondaryColor = colors.secondary;
                        this.currentTheme = colors.themeId || 'orange-fire';
                        return true;
                    }
                }
            }

            const savedTheme = localStorage.getItem('centinela-theme');
            if (savedTheme) {
                try {
                    const themeData = JSON.parse(savedTheme);
                    if (themeData && themeData.themeId) {
                        const themePresets = this.getThemePresets();
                        const theme = themePresets[themeData.themeId];
                        if (theme) {
                            this.loadThemeColors(themeData.themeId);
                            return true;
                        }
                    }
                } catch (e) {}
            }
            return false;
        } catch (error) {
            console.warn('⚠️ Error cargando de localStorage:', error);
            return false;
        }
    }

    async loadColorsFromDatabase() {
        try {
            if (!this.userManager) return false;
            const currentUser = this.userManager.currentUser;
            if (!currentUser) return false;

            let themeId = currentUser.theme;
            if (!themeId || themeId === 'predeterminado') {
                themeId = 'orange-fire';
            }

            if (this.currentTheme === themeId) return true;

            this.loadThemeColors(themeId);
            this.currentTheme = themeId;
            this.saveToLocalStorage(themeId);
            return true;
        } catch (error) {
            console.error('🔥 Error:', error);
            return false;
        }
    }

    saveToLocalStorage(themeId) {
        try {
            localStorage.setItem('particle-colors', JSON.stringify({
                primary: this.primaryColor,
                secondary: this.secondaryColor,
                themeId: themeId,
                timestamp: Date.now()
            }));
            localStorage.setItem('centinela-theme', JSON.stringify({
                themeId: themeId,
                timestamp: Date.now(),
                source: 'particle-system'
            }));
        } catch (e) {
            console.warn('⚠️ No se pudo guardar:', e);
        }
    }

    loadThemeColors(themeId) {
        const themePresets = this.getThemePresets();
        const theme = themePresets[themeId];

        if (!theme) {
            console.warn(`⚠️ Tema ${themeId} no encontrado, usando orange-fire`);
            return false;
        }

        const accentColor = theme.colors['--color-accent-primary'];
        this.updateParticleColors(accentColor);
        this.currentTheme = themeId;
        return true;
    }

    updateParticleColors(accentColor) {
        if (accentColor.startsWith('#')) {
            const rgb = this.hexToRgb(accentColor);
            this.primaryColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.8)`;
            const lighter = {
                r: Math.min(255, rgb.r + 40),
                g: Math.min(255, rgb.g + 40),
                b: Math.min(255, rgb.b + 40)
            };
            this.secondaryColor = `rgba(${lighter.r}, ${lighter.g}, ${lighter.b}, 0.8)`;
        } else if (accentColor.includes('rgb')) {
            this.primaryColor = accentColor.replace(')', ', 0.8)').replace('rgb', 'rgba');
            const match = accentColor.match(/(\d+),\s*(\d+),\s*(\d+)/);
            if (match) {
                const r = Math.min(255, parseInt(match[1]) + 40);
                const g = Math.min(255, parseInt(match[2]) + 40);
                const b = Math.min(255, parseInt(match[3]) + 40);
                this.secondaryColor = `rgba(${r}, ${g}, ${b}, 0.8)`;
            } else {
                this.secondaryColor = this.primaryColor;
            }
        } else {
            this.primaryColor = 'rgba(255, 102, 0, 0.8)';
            this.secondaryColor = 'rgba(255, 136, 51, 0.8)';
        }

        if (this.particles.length > 0) {
            this.updateExistingParticles();
        }
    }

    updateExistingParticles() {
        this.particles.forEach(particle => {
            particle.color = Math.random() > 0.7 ? this.secondaryColor : this.primaryColor;
        });
    }

    useDefaultColors() {
        this.primaryColor = 'rgba(255, 102, 0, 0.8)';
        this.secondaryColor = 'rgba(255, 136, 51, 0.8)';
        this.currentTheme = 'orange-fire';
        if (this.particles.length > 0) {
            this.updateExistingParticles();
        }
    }

    hexToRgb(hex) {
        hex = hex.replace('#', '');
        if (hex.length === 3) {
            hex = hex.split('').map(c => c + c).join('');
        }
        const r = parseInt(hex.substring(0, 2), 16);
        const g = parseInt(hex.substring(2, 4), 16);
        const b = parseInt(hex.substring(4, 6), 16);
        return { r, g, b };
    }

    createParticles() {
        this.particles = [];
        const particleCount = Math.floor(window.innerWidth / 15);
        for (let i = 0; i < particleCount; i++) {
            this.particles.push({
                x: Math.random() * this.canvas.width,
                y: Math.random() * this.canvas.height,
                size: Math.random() * 3 + 1,
                speedX: Math.random() * 1 - 0.5,
                speedY: Math.random() * 1 - 0.5,
                color: Math.random() > 0.7 ? this.secondaryColor : this.primaryColor,
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            p.x += p.speedX;
            p.y += p.speedY;
            if (p.x < 0 || p.x > this.canvas.width) p.speedX *= -1;
            if (p.y < 0 || p.y > this.canvas.height) p.speedY *= -1;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fillStyle = p.color;
            this.ctx.fill();
            for (let j = i; j < this.particles.length; j++) {
                const p2 = this.particles[j];
                const distance = Math.sqrt(Math.pow(p.x - p2.x, 2) + Math.pow(p.y - p2.y, 2));
                if (distance < 120) {
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = p.color.replace('0.8', '0.2');
                    this.ctx.lineWidth = 0.7;
                    this.ctx.moveTo(p.x, p.y);
                    this.ctx.lineTo(p2.x, p2.y);
                    this.ctx.stroke();
                }
            }
        }
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    resizeCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    setupEventListeners() {
        const resizeHandler = () => {
            this.resizeCanvas();
            this.createParticles();
        };
        window.addEventListener("resize", resizeHandler);

        const themeChangeHandler = (event) => {
            if (event.detail?.themeId) {
                this.loadThemeColors(event.detail.themeId);
                this.saveToLocalStorage(event.detail.themeId);
            }
        };
        document.addEventListener('themeApplied', themeChangeHandler);
        document.addEventListener('themeChanged', themeChangeHandler);

        const storageHandler = (event) => {
            if (event.key === 'centinela-theme') {
                try {
                    const themeData = JSON.parse(event.newValue);
                    if (themeData && themeData.themeId) {
                        this.loadThemeColors(themeData.themeId);
                    }
                } catch (e) {}
            }
            if (event.key === 'particle-colors') {
                try {
                    const colors = JSON.parse(event.newValue);
                    if (colors) {
                        this.primaryColor = colors.primary;
                        this.secondaryColor = colors.secondary;
                        this.updateExistingParticles();
                    }
                } catch (e) {}
            }
        };
        window.addEventListener('storage', storageHandler);

        this.eventListeners = {
            resize: resizeHandler,
            themeApplied: themeChangeHandler,
            themeChanged: themeChangeHandler,
            storage: storageHandler
        };
    }

    // =============================================
    // TEMA ÚNICO: NARANJA FIRE (COMPLETO)
    // Con navbar sólido, footer con fondo, y todos los estilos
    // =============================================
    getThemePresets() {
        return {
            'orange-fire': {
                name: 'Fuego Naranja',
                description: 'Tema naranja vibrante con efectos neón',
                colors: {
                    '--color-accent-primary': '#FF6600',
                    '--color-accent-secondary': '#FF8833',
                    '--color-accent-footer': '#FF6600',
                    '--color-shadow': 'rgba(255, 102, 0, 0.55)',
                    '--color-glow': '#FF6600',
                    '--color-active': '#FF6600',
                    '--color-border-dark': '#FF6600'
                }
            }
        };
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        document.body.classList.remove('particulas-active');
        const styles = document.querySelectorAll('style[data-particle-styles]');
        styles.forEach(style => style.remove());
        if (this.eventListeners) {
            window.removeEventListener("resize", this.eventListeners.resize);
            document.removeEventListener('themeApplied', this.eventListeners.themeApplied);
            document.removeEventListener('themeChanged', this.eventListeners.themeChanged);
            window.removeEventListener('storage', this.eventListeners.storage);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    if (window.particleSystem) {
        try { window.particleSystem.destroy(); } catch (e) {}
    }
    window.particleSystem = new ParticleSystem();
});

window.updateParticleColors = function (themeId) {
    if (window.particleSystem) {
        window.particleSystem.loadThemeColors(themeId);
        return true;
    }
    return false;
};

window.reloadParticleColors = async function () {
    if (window.particleSystem) {
        const now = Date.now();
        if (now - window.particleSystem.lastDatabaseCheck > window.particleSystem.databaseCheckInterval) {
            await window.particleSystem.loadColorsFromDatabase();
            window.particleSystem.lastDatabaseCheck = now;
        }
        return true;
    }
    return false;
};